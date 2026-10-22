#!/usr/bin/env tsx
/** DESTRUCTIVE: drops and recreates the schema, then re-applies migrations. Local only. */
import { loadEnvFiles } from "../src/lib/load-env";

loadEnvFiles();

async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { getDbAsync, getRawClient, closeDatabase } = await import("../src/lib/db");
  const { applyMigrations } = await import("../src/lib/db/migrate");

  const env = getEnv();
  const isLocal =
    !env.DATABASE_URL ||
    /localhost|127\.0\.0\.1|::1/.test(env.DATABASE_URL) ||
    env.DATABASE_URL.includes("pglite");
  const force = process.argv.includes("--force");

  if (env.NODE_ENV === "production" || (!isLocal && !force)) {
    console.error("✗ Refusing to reset a non-local database. Re-run with --force only if you are certain.");
    process.exitCode = 1;
    return;
  }

  await getDbAsync();
  const raw = getRawClient();
  console.log(`→ Dropping schema in ${env.DATABASE_URL ? "PostgreSQL" : "local PGlite"} …`);
  await raw.execRaw("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  const result = await applyMigrations({ log: (m) => console.log(`   ${m}`) });
  console.log(`✓ Reset complete (${result.applied.length} migrations applied). Run "npm run db:seed" next.`);
  await closeDatabase();
}

main().catch((err) => {
  console.error(`✗ Reset failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
