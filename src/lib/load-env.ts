/**
 * Minimal, dependency-free .env loader for CLI scripts, the worker and Vitest.
 * Next.js loads .env files itself for the web app; this keeps non-Next entrypoints
 * (migrate/seed/worker/tests) consistent without pulling in dotenv.
 * Existing process env always wins (so CI/production secrets are never overridden).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let loaded = false;

export function loadEnvFiles(cwd = process.cwd()): void {
  if (loaded) return;
  loaded = true;
  const files =
    process.env.NODE_ENV === "production"
      ? [".env.production.local", ".env.local", ".env"]
      : [".env.local", ".env.development.local", ".env"];
  for (const file of files) {
    const full = path.join(cwd, file);
    if (!existsSync(full)) continue;
    const parsed = parseEnvFile(readFileSync(full, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
