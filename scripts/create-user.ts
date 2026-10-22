#!/usr/bin/env tsx
/**
 * Secure account creation (no public "default admin" account is ever seeded by the app).
 *
 *   npm run create:admin -- --email=you@example.com --name="Your Name"
 *   npm run create:customer -- --email=you@example.com --name="Your Name" --password="..."
 *
 * Flags:
 *   --email=...  --name=...  --role=admin|customer|support|finance
 *   --password=...   (optional; a strong random password is generated and printed)
 *   --verify         (mark email as verified immediately)
 */
import { randomBytes } from "node:crypto";
import { loadEnvFiles } from "../src/lib/load-env";

loadEnvFiles();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1]!.startsWith("--")) {
    return process.argv[index + 1];
  }
  return undefined;
}

async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { applyMigrations } = await import("../src/lib/db/migrate");
  const { db, getDbAsync, closeDatabase } = await import("../src/lib/db");
  const { users } = await import("../src/lib/db/schema");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { sql } = await import("drizzle-orm");

  const env = getEnv();
  const email = arg("email");
  const name = arg("name");
  const role = (arg("role") ?? (process.argv.includes("--role=admin") ? "admin" : "customer")) as
    | "admin"
    | "customer"
    | "support"
    | "finance";

  if (!email || !name) {
    console.error("Usage: tsx scripts/create-user.ts --email=you@example.com --name=\"Your Name\" [--role=admin] [--password=...]");
    process.exitCode = 1;
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("✗ Invalid email address.");
    process.exitCode = 1;
    return;
  }
  if (!["admin", "customer", "support", "finance"].includes(role)) {
    console.error("✗ Invalid role.");
    process.exitCode = 1;
    return;
  }

  const password = arg("password") ?? `Amp-${randomBytes(9).toString("base64url")}7`;
  if (password.length < 10) {
    console.error("✗ Password must be at least 10 characters.");
    process.exitCode = 1;
    return;
  }

  await getDbAsync();
  await applyMigrations();
  const existing = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
  if (existing[0]) {
    console.error(`✗ An account with ${email} already exists.`);
    process.exitCode = 1;
    await closeDatabase();
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    email,
    name,
    passwordHash,
    role,
    emailVerifiedAt: process.argv.includes("--verify") || env.DEMO_MODE ? new Date() : null,
  });

  console.log("✓ Account created");
  console.log(`  email:    ${email}`);
  console.log(`  role:     ${role}`);
  console.log(`  password: ${password}`);
  console.log("  Store the password in a password manager — it is not shown again.");
  if (!process.argv.includes("--verify") && !env.DEMO_MODE) {
    console.log("  Email verification is required before ordering (or re-run with --verify).");
  }
  await closeDatabase();
}

main().catch(async (err) => {
  console.error(`✗ Failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
