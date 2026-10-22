import { z } from "zod";

/**
 * Server-side environment contract.
 * Every secret is optional at parse time and validated by `assertProductionReady()`
 * at boot, so local demo mode runs with zero credentials while production fails loudly.
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("Amplifi"),
  APP_URL: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Database: set DATABASE_URL for real Postgres. Without it, a local PGlite instance is used.
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: bool(false),
  DB_POOL_MAX: int(10, 1, 50),
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),

  // Security
  SESSION_SECRET: z.string().min(32).optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
  TRUST_PROXY_HEADERS: bool(true),
  ALLOW_SEED_IN_PRODUCTION: bool(false),

  // Demo / simulation
  DEMO_MODE: bool(false),
  DEMO_AUTO_VERIFY_EMAIL: bool(true),
  INLINE_WORKER: bool(false),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@amplifi.local"),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_CUSTOMER_EMAIL: z.string().email().default("demo@amplifi.local"),
  SEED_CUSTOMER_PASSWORD: z.string().optional(),

  // Payments
  PAYMENTS_PROVIDER: z.enum(["mock", "razorpay"]).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_MODE: z.enum(["test", "live"]).default("test"),

  // Email
  EMAIL_PROVIDER: z.enum(["console", "smtp"]).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: int(587, 1, 65535),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool(false),
  EMAIL_FROM: z.string().default("Amplifi <no-reply@amplifi.local>"),
  EMAIL_OUTBOX_DIR: z.string().default(".data/mail"),

  // Workers
  WORKER_POLL_MS: int(2000, 250, 60_000),
  WORKER_ID: z.string().optional(),
  WORKER_BATCH_SIZE: int(5, 1, 50),

  // Providers
  MOCK_PROVIDER_ENABLED: bool(true),
  MANUAL_PROVIDER_ENABLED: bool(true),
  META_PROVIDER_ENABLED: bool(false),
  META_GRAPH_VERSION: z.string().default("v23.0"),
  META_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_INSTAGRAM_ACTOR_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_EXISTING_POST_ID: z.string().optional(),
  META_INSTAGRAM_MEDIA_ID: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  AGENCY_PROVIDER_ENABLED: bool(false),
  AGENCY_API_BASE_URL: z.string().optional(),
  AGENCY_API_KEY: z.string().optional(),
  AGENCY_WEBHOOK_SECRET: z.string().optional(),

  // Uploads & limits
  UPLOAD_DIR: z.string().default(".data/uploads"),
  MAX_UPLOAD_BYTES: int(5 * 1024 * 1024, 1024, 25 * 1024 * 1024),

  // Observability
  SENTRY_DSN: z.string().optional(),
  HEALTHCHECK_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function build(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env = parsed.data;

  const isProd = env.NODE_ENV === "production";
  const demo = env.DEMO_MODE || (!isProd && !env.DATABASE_URL);

  // Never allow a silent production boot with demo/mock money movement.
  const paymentsProvider = env.PAYMENTS_PROVIDER ?? (demo ? "mock" : "razorpay");
  if (isProd && paymentsProvider === "mock" && env.DEMO_MODE) {
    // Explicitly requested demo deployment: permitted, but callers must surface the banner.
    env.DEMO_MODE = true;
  } else if (isProd && paymentsProvider === "mock") {
    throw new Error(
      "PAYMENTS_PROVIDER=mock is not allowed in production unless DEMO_MODE=true (a demo instance must never take real orders).",
    );
  }

  return {
    ...env,
    DEMO_MODE: demo || env.DEMO_MODE,
    PAYMENTS_PROVIDER: paymentsProvider,
    EMAIL_PROVIDER: env.EMAIL_PROVIDER ?? (env.SMTP_HOST ? "smtp" : "console"),
  };
}

export function getEnv(): Env {
  if (!cached) cached = build();
  return cached;
}

/** Test helper: forget the memoised env after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export type EnvironmentWarning = { level: "warn" | "error"; message: string };

/** Returns actionable warnings; throws only for configurations that would be unsafe in production. */
export function validateEnvironment(env: Env = getEnv()): EnvironmentWarning[] {
  const warnings: EnvironmentWarning[] = [];
  if (env.NODE_ENV === "production") {
    if (!env.SESSION_SECRET) {
      throw new Error("SESSION_SECRET is required in production (32+ random characters).");
    }
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required in production. PGlite mode is for local development only.");
    }
    if (!env.CREDENTIAL_ENCRYPTION_KEY) {
      throw new Error("CREDENTIAL_ENCRYPTION_KEY is required in production to encrypt provider credentials at rest.");
    }
    if (env.DEMO_MODE) {
      warnings.push({
        level: "warn",
        message:
          "DEMO_MODE is enabled in production. All provider results are simulated and will be labelled DEMO DATA. Never market this instance as live delivery.",
      });
    }
    if (env.PAYMENTS_PROVIDER === "razorpay" && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET)) {
      warnings.push({
        level: "error",
        message: "Razorpay is selected but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET are incomplete. Checkout will fail until configured.",
      });
    }
    if (env.EMAIL_PROVIDER === "console") {
      warnings.push({ level: "warn", message: "EMAIL_PROVIDER=console in production: emails are logged, not delivered." });
    }
    if (!env.APP_URL.startsWith("https://")) {
      warnings.push({ level: "warn", message: "APP_URL is not https:// — secure cookies may not be set behind a proxy." });
    }
    if (env.META_PROVIDER_ENABLED && (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID || !env.META_PAGE_ID)) {
      warnings.push({
        level: "error",
        message: "META_PROVIDER_ENABLED=true but Meta credentials are incomplete. Provider will stay unconfigured.",
      });
    }
  }
  return warnings;
}

export function isProd(): boolean {
  return getEnv().NODE_ENV === "production";
}
