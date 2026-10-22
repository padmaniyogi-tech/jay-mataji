import { getEnv } from "@/lib/env";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|api[_-]?key|card|cvv|credential|cookie|signature/i;

/** Deep-redact known-sensitive keys before anything reaches the log stream. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = typeof v === "string" && v.length > 0 ? "***redacted***" : v;
    } else if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  let configured: Level = "info";
  try {
    configured = getEnv().LOG_LEVEL;
  } catch {
    configured = "info";
  }
  if (order[level] < order[configured]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

/** Hook for an error-monitoring SDK (Sentry et al.). Keeps a single capture point. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error("unhandled_exception", {
    ...context,
    errorName: err.name,
    errorMessage: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    monitoringConfigured: Boolean(getEnv().SENTRY_DSN),
  });
}
