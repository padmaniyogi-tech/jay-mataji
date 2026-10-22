import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    // Only used by `drizzle-kit push/studio`; migrations in this repo are plain SQL
    // applied by scripts/migrate.ts (works for both pg and PGlite).
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/amplifi",
  },
} satisfies Config;
