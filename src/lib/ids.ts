import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford-ish, no I/L/O/U

export function randomId(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Human-friendly, non-sequential public order ID: AMP-7K2QX4DY. */
export function generatePublicId(prefix = "AMP"): string {
  return `${prefix}-${randomId(8)}`;
}

export function generateReceiptNumber(orderPublicId: string, attempt = 1): string {
  const suffix = attempt > 1 ? `-${attempt}` : "";
  return `RCPT-${orderPublicId.replace(/^AMP-/, "")}${suffix}`;
}

export function generateTicketPublicId(): string {
  return `TKT-${randomId(8)}`;
}

export function newIdempotencyKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

/** Constant-time-ish comparison for short tokens (also used for webhook verification). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
