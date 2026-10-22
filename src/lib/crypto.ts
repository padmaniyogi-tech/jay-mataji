import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "@/lib/env";

/** SHA-256 hex digest — used for session/email tokens and webhook payload hashes. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmacSha256(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmacSha256(payload: string, secret: string, signature: string): boolean {
  const expected = hmacSha256(payload, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------------ */
/* Provider credential encryption at rest (AES-256-GCM)                      */
/* ------------------------------------------------------------------------ */

function encryptionKey(): Buffer {
  const env = getEnv();
  if (env.CREDENTIAL_ENCRYPTION_KEY) {
    const raw = env.CREDENTIAL_ENCRYPTION_KEY;
    // Accept 64-char hex, base64, or a passphrase (derived with scrypt + static salt).
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
    return scryptSync(raw, "amplifi-provider-credentials-v1", 32);
  }
  if (env.NODE_ENV === "production") {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required to store provider credentials in production.");
  }
  // Deterministic dev-only key so a restarted dev server can still read saved credentials.
  return scryptSync(env.SESSION_SECRET ?? "amplifi-dev-only-secret", "amplifi-provider-credentials-v1", 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Malformed encrypted credential.");
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Shows only the last 4 characters — used by the admin UI. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 8) return "•".repeat(Math.max(value.length, 4));
  return `${"•".repeat(8)}${value.slice(-4)}`;
}
