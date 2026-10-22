import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, AuthError, RateLimitError, ValidationError, toErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export function jsonError(
  message: string,
  options: { status?: number; code?: string; details?: unknown; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { message, code: options.code ?? "error", details: options.details } },
    { status: options.status ?? 400, headers: { ...NO_STORE_HEADERS, ...(options.headers ?? {}) } },
  );
}

type Handler = (req: Request) => Promise<Response>;

/** Wraps a route handler: consistent JSON errors, no stack leakage, structured logging. */
export function withApiRoute(handler: Handler): Handler {
  return async (req: Request) => {
    try {
      await ensureDatabaseReady();
      return await handler(req);
    } catch (err) {
      if (err instanceof ZodError) {
        return jsonError("Some fields need attention.", {
          status: 422,
          code: "validation_error",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      if (err instanceof RateLimitError) {
        return jsonError(err.message, {
          status: 429,
          code: err.code,
          details: err.details,
          headers: { "Retry-After": String(err.retryAfterSeconds) },
        });
      }
      if (err instanceof AppError) {
        return jsonError(err.message, {
          status: err.status,
          code: err.code,
          details: err.expose ? err.details : undefined,
        });
      }
      logger.error("api_unhandled_error", {
        path: new URL(req.url).pathname,
        message: toErrorMessage(err),
        stack: getEnv().NODE_ENV === "production" ? undefined : (err as Error)?.stack,
      });
      return jsonError("Something went wrong on our side. Please try again.", { status: 500, code: "internal_error" });
    }
  };
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ValidationError("Expected an application/json request body.");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body is not valid JSON.");
  }
  return schema.parse(body);
}

export function getClientIp(req: Request): string {
  const env = getEnv();
  if (env.TRUST_PROXY_HEADERS) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim().slice(0, 64);
  }
  return "127.0.0.1";
}

/**
 * CSRF defence for cookie-authenticated mutations:
 * - JSON-only bodies (no HTML form posts), and
 * - when a browser supplies Origin, it must match the request host.
 * Combined with SameSite=Lax session cookies this blocks cross-site writes.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // Non-browser client (tests, server-to-server) with no ambient cookies cross-site.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("Invalid Origin header.", { status: 403, code: "csrf_origin_invalid" });
  }
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || req.headers.get("host") || "";
  const allowed = new Set<string>([host, new URL(getEnv().APP_URL).host]);
  if (!allowed.has(originHost)) {
    throw new AppError("Cross-site request blocked.", { status: 403, code: "csrf_origin_mismatch" });
  }
}

export function assertNotSuspended(user: { suspendedAt: Date | null } | null): void {
  if (!user) throw new AuthError();
  if (user.suspendedAt) {
    throw new AppError("This account is suspended. Contact support.", { status: 403, code: "account_suspended" });
  }
}

export function parsePagination(url: URL, defaults: { pageSize?: number; maxPageSize?: number } = {}) {
  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get("pageSize") ?? defaults.pageSize ?? 10) || 10, 1),
    defaults.maxPageSize ?? 50,
  );
  const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
