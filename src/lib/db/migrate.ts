import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getDbAsync, getRawClient } from "./index";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

type MigrationFile = { name: string; sql: string; hash: string };

export function loadMigrationFiles(dir = MIGRATIONS_DIR): MigrationFile[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`No migrations directory found at ${dir}. Run "npm run db:generate" first.`);
  }
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const sql = readFileSync(path.join(dir, name), "utf8");
      return { name, sql, hash: createHash("sha256").update(sql).digest("hex").slice(0, 32) };
    });
}

/**
 * Applies pending SQL migrations exactly once, tracked in `__migrations`.
 * Works identically on node-postgres and PGlite.
 */
export async function applyMigrations(options: { dir?: string; log?: (msg: string) => void } = {}) {
  const log = options.log ?? (() => undefined);
  await getDbAsync();
  const raw = getRawClient();
  await raw.execRaw(`
    create table if not exists "__migrations" (
      "name" varchar(255) primary key,
      "hash" varchar(64) not null,
      "applied_at" timestamptz not null default now()
    );
  `);
  const applied = await raw.rawQuery(`select name, hash from "__migrations"`);
  const appliedMap = new Map(applied.rows.map((r) => [String(r.name), String(r.hash)]));
  const files = loadMigrationFiles(options.dir);
  const newlyApplied: string[] = [];

  for (const file of files) {
    const existing = appliedMap.get(file.name);
    if (existing === file.hash) continue;
    if (existing && existing !== file.hash) {
      throw new Error(
        `Migration ${file.name} was modified after being applied (hash mismatch). Create a new migration instead of editing applied files.`,
      );
    }
    log(`applying ${file.name}`);
    await raw.execRaw("BEGIN");
    try {
      await raw.execRaw(file.sql);
      await raw.rawQuery(`insert into "__migrations" ("name", "hash") values ($1, $2)`, [file.name, file.hash]);
      await raw.execRaw("COMMIT");
      newlyApplied.push(file.name);
    } catch (err) {
      await raw.execRaw("ROLLBACK").catch(() => undefined);
      throw new Error(`Migration ${file.name} failed: ${(err as Error).message}`);
    }
  }
  return { applied: newlyApplied, total: files.length };
}
