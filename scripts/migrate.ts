#!/usr/bin/env tsx
import { loadEnvFiles } from "../src/lib/load-env";

loadEnvFiles();

async function main() {
  const { applyMigrations } = await import("../src/lib/db/migrate");
  const { getEnv } = await import("../src/lib/env");
  const { getDbAsync, closeDatabase } = await import("../src/lib/db");
  const env = getEnv();
  console.log(`→ Applying migrations to ${env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : "local PGlite"}`);
  await getDbAsync();
  const result = await applyMigrations({ log: (m) => console.log(`   ${m}`) });
  console.log(
    result.applied.length === 0
      ? `✓ Database up to date (${result.total} migration files)`
      : `✓ Applied ${result.applied.length}/${result.total} migrations`,
  );
  await closeDatabase();
}

main().catch(async (err) => {
  console.error(`✗ Migration failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
