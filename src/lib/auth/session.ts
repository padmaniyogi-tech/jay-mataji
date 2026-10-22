import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, getDbAsync } from "@/lib/db";
import { sessions, users, type User, type UserRole } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { AuthError, ForbiddenError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/crypto";
import { hasPermission, isStaff, type Permission } from "./permissions";

export const SESSION_COOKIE = "amplifi_session";
const SESSION_TTL_DAYS = 14;

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "emailVerifiedAt" | "suspendedAt" | "createdAt" | "company" | "phone" | "marketingOptIn"
>;

function cookieOptions(expiresAt: Date) {
  const env = getEnv();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production" && env.APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  await getDbAsync();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip?.slice(0, 64) ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

/** Resolves a raw token (used by tests and the API surface). */
export async function resolveSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  await getDbAsync();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      suspendedAt: users.suspendedAt,
      createdAt: users.createdAt,
      company: users.company,
      phone: users.phone,
      marketingOptIn: users.marketingOptIn,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.suspendedAt) return null;
  const { expiresAt: _expires, ...user } = row;
  return user;
}

export async function revokeSessionToken(token: string): Promise<void> {
  await getDbAsync();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, sha256(token)));
}

export async function revokeAllSessions(userId: string, exceptTokenHash?: string): Promise<void> {
  await getDbAsync();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      exceptTokenHash
        ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.tokenHash} <> ${exceptTokenHash}`)
        : and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    );
}

/** Current user for the active request (cached so a page render only hits the DB once). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerifiedAt && !getEnv().DEMO_MODE) {
    throw new ForbiddenError("Verify your email address before placing orders.");
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) throw new ForbiddenError();
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export function canAccessAdmin(user: SessionUser | null): boolean {
  return Boolean(user && isStaff(user.role));
}
