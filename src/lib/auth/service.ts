import { and, eq, isNull, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction, type Executor } from "@/lib/db";
import { emailTokens, users, type User } from "@/lib/db/schema";
import { AppError, AuthError, ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/jobs/outbox";
import { createSession, revokeAllSessions, type SessionUser } from "./session";
import { hashPassword, verifyPassword, burnPasswordCheck } from "./password";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

async function issueEmailToken(
  executor: Executor,
  userId: string,
  type: "verify_email" | "reset_password",
  ttlMs: number,
): Promise<string> {
  const token = randomToken(32);
  await executor.insert(emailTokens).values({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

async function consumeEmailToken(
  executor: Executor,
  token: string,
  type: "verify_email" | "reset_password",
): Promise<string> {
  const hash = sha256(token);
  const rows = await executor
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, hash), eq(emailTokens.type, type), isNull(emailTokens.usedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ValidationError("This link is invalid or has already been used.");
  if (row.expiresAt.getTime() < Date.now()) throw new ValidationError("This link has expired. Request a new one.");
  await executor.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, row.id));
  return row.userId;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  await getDbAsync();
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email.trim()})`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  await getDbAsync();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  marketingOptIn?: boolean;
  ip?: string | null;
  userAgent?: string | null;
};

export async function registerUser(input: RegisterInput): Promise<{
  user: User;
  token: string;
  expiresAt: Date;
  verificationSent: boolean;
}> {
  const env = getEnv();
  const existing = await findUserByEmail(input.email);
  if (existing) throw new ConflictError("An account with this email already exists. Try signing in instead.");

  const passwordHash = await hashPassword(input.password);
  const autoVerify = env.DEMO_MODE && env.DEMO_AUTO_VERIFY_EMAIL;

  const user = await withTransaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: "customer",
        marketingOptIn: input.marketingOptIn ?? false,
        emailVerifiedAt: autoVerify ? new Date() : null,
        lastLoginAt: new Date(),
      })
      .returning();
    const created = inserted[0];
    if (!created) throw new Error("User insert returned no row.");

    const verifyToken = await issueEmailToken(tx, created.id, "verify_email", VERIFY_TTL_MS);
    await enqueueOutbox(tx, "email.send", `email:verify:${created.id}:${Date.now()}`, {
      to: created.email,
      name: created.name,
      template: "verify_email",
      data: {
        name: created.name,
        verifyUrl: `${env.APP_URL}/verify-email?token=${verifyToken}`,
      },
    });
    return created;
  });

  const session = await createSession(user.id, { userAgent: input.userAgent, ip: input.ip });
  await recordAudit(db, {
    action: "auth.registered",
    entityType: "user",
    entityId: user.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    metadata: { autoVerified: autoVerify, marketingOptIn: user.marketingOptIn },
    ip: input.ip ?? null,
  });

  return { user, token: session.token, expiresAt: session.expiresAt, verificationSent: true };
}

export async function verifyEmail(token: string): Promise<{ ok: true; alreadyVerified: boolean }> {
  await getDbAsync();
  const result = await withTransaction(async (tx) => {
    const userId = await consumeEmailToken(tx, token, "verify_email");
    const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw new ValidationError("Account not found.");
    if (user.emailVerifiedAt) return { ok: true as const, alreadyVerified: true };
    await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    return { ok: true as const, alreadyVerified: false };
  });
  await recordAudit(db, { action: "auth.email_verified", entityType: "user", metadata: { verified: !result.alreadyVerified } });
  return result;
}

export async function resendVerificationEmail(user: SessionUser): Promise<void> {
  if (user.emailVerifiedAt) return;
  const env = getEnv();
  const fullUser = await findUserById(user.id);
  if (!fullUser) throw new AuthError();
  await withTransaction(async (tx) => {
    const token = await issueEmailToken(tx, user.id, "verify_email", VERIFY_TTL_MS);
    await enqueueOutbox(tx, "email.send", `email:verify:${user.id}:${Date.now()}`, {
      to: fullUser.email,
      name: fullUser.name,
      template: "verify_email",
      data: { name: fullUser.name, verifyUrl: `${env.APP_URL}/verify-email?token=${token}` },
    });
  });
  await recordAudit(db, { action: "auth.verification_resent", entityType: "user", entityId: user.id, actorId: user.id, actorEmail: user.email, actorRole: user.role });
}

export async function authenticate(input: {
  email: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ user: User; token: string; expiresAt: Date }> {
  await getDbAsync();
  const user = await findUserByEmail(input.email);

  if (!user) {
    // Equalise timing so account existence is not leaked.
    await burnPasswordCheck(input.password);
    await recordAudit(db, {
      action: "auth.login_failed",
      entityType: "user",
      metadata: { reason: "unknown_email" },
      ip: input.ip ?? null,
      actorEmail: input.email,
    });
    throw new AuthError("Invalid email or password.");
  }

  if (user.suspendedAt) {
    throw new ForbiddenError("This account is suspended. Contact support for help.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    await recordAudit(db, {
      action: "auth.login_failed",
      entityType: "user",
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { reason: "bad_password" },
      ip: input.ip ?? null,
    });
    throw new AuthError("Invalid email or password.");
  }

  const session = await createSession(user.id, { userAgent: input.userAgent, ip: input.ip });
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await recordAudit(db, {
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    metadata: {},
    ip: input.ip ?? null,
  });
  return { user, token: session.token, expiresAt: session.expiresAt };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const env = getEnv();
  const user = await findUserByEmail(email);
  if (!user) return; // Never reveal whether an account exists.
  await withTransaction(async (tx) => {
    const token = await issueEmailToken(tx, user.id, "reset_password", RESET_TTL_MS);
    await enqueueOutbox(tx, "email.send", `email:reset:${user.id}:${Date.now()}`, {
      to: user.email,
      name: user.name,
      template: "reset_password",
      data: { name: user.name, resetUrl: `${env.APP_URL}/reset-password?token=${token}` },
    });
  });
  await recordAudit(db, { action: "auth.password_reset_requested", entityType: "user", entityId: user.id, actorId: user.id, actorEmail: user.email, actorRole: user.role });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  const userId = await withTransaction(async (tx) => {
    const id = await consumeEmailToken(tx, token, "reset_password");
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
    return id;
  });
  await revokeAllSessions(userId);
  await recordAudit(db, { action: "auth.password_reset", entityType: "user", entityId: userId, actorRole: "system" });
}

export async function changePassword(user: SessionUser, currentPassword: string, newPassword: string): Promise<void> {
  const full = await findUserById(user.id);
  if (!full) throw new AuthError();
  const valid = await verifyPassword(currentPassword, full.passwordHash);
  if (!valid) throw new ValidationError("Your current password is incorrect.");
  if (currentPassword === newPassword) throw new ValidationError("Choose a password you haven't used here before.");
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
  await revokeAllSessions(user.id);
  await recordAudit(db, { action: "auth.password_changed", entityType: "user", entityId: user.id, actorId: user.id, actorEmail: user.email, actorRole: user.role });
}

export async function updateProfile(
  user: SessionUser,
  input: { name: string; phone?: string; company?: string; marketingOptIn: boolean },
): Promise<void> {
  await db
    .update(users)
    .set({
      name: input.name,
      phone: input.phone ?? null,
      company: input.company ?? null,
      marketingOptIn: input.marketingOptIn,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await recordAudit(db, {
    action: "user.profile_updated",
    entityType: "user",
    entityId: user.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    metadata: { marketingOptIn: input.marketingOptIn },
  });
}

export async function requireEmailVerified(user: SessionUser): Promise<void> {
  const env = getEnv();
  if (env.DEMO_MODE) return;
  if (!user.emailVerifiedAt) {
    throw new AppError("Verify your email address before placing orders.", {
      status: 403,
      code: "email_unverified",
    });
  }
}
