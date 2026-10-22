import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_ROUNDS = 12;

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((v) => /[A-Za-z]/.test(v), "Include at least one letter.")
  .refine((v) => /[0-9]/.test(v), "Include at least one number.");

// Precomputed hash of "amplifi-dummy-password" so login timing is similar for unknown accounts.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.4kX0FqQq9VJ1n8bXbFhD7lXcGJcIz4W";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function burnPasswordCheck(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
}
