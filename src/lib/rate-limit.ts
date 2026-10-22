import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Postgres-backed fixed-window rate limiter.
 * One atomic upsert per check — safe across serverless instances and workers.
 */
export async function consumeRateLimit(options: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
  const { key, limit, windowSeconds } = options;
  if (limit <= 0) return { allowed: true, count: 0, retryAfterSeconds: 0 };

  try {
    const result = await db.execute(sql`
      insert into "rate_limits" ("key", "window_start", "count", "expires_at")
      values (${key}, now(), 1, now() + (${windowSeconds} * interval '1 second'))
      on conflict ("key") do update set
        "count" = case
          when "rate_limits"."window_start" < now() - (${windowSeconds} * interval '1 second') then 1
          else "rate_limits"."count" + 1
        end,
        "window_start" = case
          when "rate_limits"."window_start" < now() - (${windowSeconds} * interval '1 second') then now()
          else "rate_limits"."window_start"
        end,
        "expires_at" = case
          when "rate_limits"."window_start" < now() - (${windowSeconds} * interval '1 second')
            then now() + (${windowSeconds} * interval '1 second')
          else "rate_limits"."expires_at"
        end
      returning "count", "window_start"
    `);
    const row = (result as unknown as { rows?: Record<string, unknown>[] }).rows?.[0];
    const count = Number(row?.count ?? 1);
    const windowStart = row?.window_start ? new Date(String(row.window_start)) : new Date();
    const elapsed = Math.floor((Date.now() - windowStart.getTime()) / 1000);
    return {
      allowed: count <= limit,
      count,
      retryAfterSeconds: Math.max(windowSeconds - elapsed, 1),
    };
  } catch (err) {
    // Fail open but log: a rate-limiter outage must not take the whole site down.
    logger.warn("rate_limit_unavailable", { key, message: (err as Error).message });
    return { allowed: true, count: 0, retryAfterSeconds: 0 };
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await consumeRateLimit({ key, limit, windowSeconds });
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  orderCreate: { limit: 15, windowSeconds: 60 * 60 },
  quote: { limit: 120, windowSeconds: 10 * 60 },
  checkout: { limit: 30, windowSeconds: 10 * 60 },
  webhook: { limit: 300, windowSeconds: 60 },
  support: { limit: 20, windowSeconds: 60 * 60 },
  upload: { limit: 20, windowSeconds: 60 * 60 },
  admin: { limit: 240, windowSeconds: 60 },
  /** Public demo surface: cheap, but anonymous, so keep it tight per IP. */
  demoStart: { limit: 15, windowSeconds: 10 * 60 },
  demoStatus: { limit: 240, windowSeconds: 10 * 60 },
} as const;
