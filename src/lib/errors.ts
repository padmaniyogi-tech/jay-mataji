export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(message: string, options: { code?: string; status?: number; details?: unknown; expose?: boolean } = {}) {
    super(message);
    this.name = "AppError";
    this.code = options.code ?? "app_error";
    this.status = options.status ?? 400;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "validation_error", status: 422, details });
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required.", status = 401) {
    super(message, { code: "auth_error", status });
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, { code: "forbidden", status: 403 });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, { code: "not_found", status: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "That request conflicts with existing data.", details?: unknown) {
    super(message, { code: "conflict", status: 409, details });
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please wait a moment and try again.", {
      code: "rate_limited",
      status: 429,
      details: { retryAfterSeconds },
    });
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Transient provider failure — safe to retry with backoff. */
export class ProviderTransientError extends Error {
  readonly code: string;
  constructor(message: string, code = "provider_transient") {
    super(message);
    this.name = "ProviderTransientError";
    this.code = code;
  }
}

/** Permanent provider failure — retrying would not help; stop and reconcile. */
export class ProviderPermanentError extends Error {
  readonly code: string;
  constructor(message: string, code = "provider_permanent") {
    super(message);
    this.name = "ProviderPermanentError";
    this.code = code;
  }
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}
