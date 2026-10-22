import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { Pool } from "pg";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { pgliteTxMutex } from "./mutex";
import * as schema from "./schema";

export { schema };

/**
 * `PgDatabase<any, …>` keeps full schema typing while allowing either driver:
 *  - pg (node-postgres) for Supabase/Neon/RDS/self-hosted Postgres
 *  - PGlite (Postgres compiled to WASM) for zero-setup local demo & tests
 */
export type Database = PgDatabase<any, typeof schema>;
export type Transaction = PgTransaction<any, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type Executor = Database | Transaction;
export type Dialect = "pg" | "pglite";

type Instance = {
  db: Database;
  dialect: Dialect;
  close: () => Promise<void>;
  /** For health checks and parameterised raw SQL. */
  rawQuery: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  /** Multi-statement DDL execution (migrations). */
  execRaw: (sql: string) => Promise<void>;
};

/**
 * Next.js dev compiles each route into its own module registry, which would otherwise create
 * one PGlite client per route and fight over the single-writer data directory. Caching the
 * instance (and the in-flight init promise) on globalThis keeps one client per process.
 */
const GLOBAL_KEY = "__amplifiDb";
type DbGlobals = typeof globalThis & {
  [GLOBAL_KEY]?: { instance: Instance | null; initPromise: Promise<Instance> | null };
};

function store(): { instance: Instance | null; initPromise: Promise<Instance> | null } {
  const g = globalThis as DbGlobals;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { instance: null, initPromise: null };
  return g[GLOBAL_KEY]!;
}

function createPgInstance(): Instance {
  const env = getEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => logger.error("pg_pool_error", { message: err.message }));
  const db = drizzleNodePg(pool, { schema }) as unknown as NodePgDatabase<typeof schema>;
  return {
    db: db as unknown as Database,
    dialect: "pg",
    close: async () => {
      await pool.end();
    },
    rawQuery: async (text, params) => {
      const res = await pool.query(text, params as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
    execRaw: async (text) => {
      await pool.query(text);
    },
  };
}

async function createPgliteInstance(): Promise<Instance> {
  const env = getEnv();
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to start PGlite in production — configure DATABASE_URL for a managed Postgres.");
  }
  const dataDir = path.resolve(process.cwd(), env.PGLITE_DATA_DIR);
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as PgliteDatabase<typeof schema>;
  logger.warn("pglite_mode_active", {
    dataDir,
    message:
      "Using bundled PGlite (single-writer WASM Postgres) for local development. Configure DATABASE_URL for production-grade Postgres.",
  });
  return {
    db: db as unknown as Database,
    dialect: "pglite",
    close: async () => {
      await client.close();
    },
    rawQuery: async (text, params) => {
      const res = await client.query<Record<string, unknown>>(text, params as unknown[]);
      return { rows: res.rows };
    },
    execRaw: async (text) => {
      await client.exec(text);
    },
  };
}

export async function getDbAsync(): Promise<Database> {
  return (await ensureInstance()).db;
}

export function getDialect(): Dialect {
  return store().instance?.dialect ?? "pglite";
}

export function getRawClient(): Instance {
  const { instance } = store();
  if (!instance) {
    throw new Error("Database not initialised. Await getDbAsync() (or run the migrate/seed script) first.");
  }
  return instance;
}

async function ensureInstance(): Promise<Instance> {
  const state = store();
  if (state.instance) return state.instance;
  if (!state.initPromise) {
    const env = getEnv();
    state.initPromise = (env.DATABASE_URL ? Promise.resolve(createPgInstance()) : createPgliteInstance())
      .then((i) => {
        state.instance = i;
        return i;
      })
      .catch((err) => {
        state.initPromise = null;
        throw err;
      });
  }
  return state.initPromise;
}

/**
 * Lazy proxy so feature modules can `import { db }` without opening a connection at
 * build/import time (Next.js evaluates modules during build).
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const { instance } = store();
    if (!instance) {
      throw new Error(
        "Database accessed before initialisation. In the app this is handled by src/lib/db/bootstrap.ts; in scripts call await getDbAsync() after applying migrations.",
      );
    }
    const value = (instance.db as unknown as Record<string | symbol, unknown>)[property];
    return typeof value === "function" ? value.bind(instance.db) : value;
  },
}) as Database;

/** Serialises transactions for the single-connection PGlite driver. */
export async function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const inst = await ensureInstance();
  const run = () => inst.db.transaction(async (tx) => fn(tx as unknown as Transaction));
  if (inst.dialect === "pglite") return pgliteTxMutex.run(run);
  return run();
}

/* --------------------------------- tests --------------------------------- */

let testClient: PGlite | null = null;

/** Creates a fresh in-memory Postgres database (used by Vitest). */
export async function initTestDatabase(): Promise<Database> {
  if (testClient) await testClient.close();
  testClient = new PGlite();
  const dbh = drizzlePglite(testClient, { schema }) as unknown as PgliteDatabase<typeof schema>;
  const state = store();
  state.instance = {
    db: dbh as unknown as Database,
    dialect: "pglite",
    close: async () => {
      await testClient?.close();
    },
    rawQuery: async (text, params) => {
      const res = await testClient!.query<Record<string, unknown>>(text, params as unknown[]);
      return { rows: res.rows };
    },
    execRaw: async (text) => {
      await testClient!.exec(text);
    },
  };
  state.initPromise = Promise.resolve(state.instance);
  return state.instance.db;
}

export async function closeDatabase(): Promise<void> {
  const state = store();
  if (state.instance) await state.instance.close();
  state.instance = null;
  state.initPromise = null;
}
