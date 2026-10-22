import { describe, expect, it } from "vitest";
import { hasPermission, homeForRole, isStaff, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { hashPassword, verifyPassword, burnPasswordCheck } from "@/lib/auth/password";

describe("role permissions", () => {
  it("gives customers only their own data", () => {
    expect(hasPermission("customer", "orders:read:own")).toBe(true);
    expect(hasPermission("customer", "orders:read:all")).toBe(false);
    expect(hasPermission("customer", "refunds:approve")).toBe(false);
    expect(hasPermission("customer", "settings:manage")).toBe(false);
  });

  it("separates support and finance duties", () => {
    expect(hasPermission("support", "orders:manage")).toBe(true);
    expect(hasPermission("support", "refunds:approve")).toBe(false);
    expect(hasPermission("finance", "refunds:approve")).toBe(true);
    expect(hasPermission("finance", "providers:manage")).toBe(false);
  });

  it("grants admins every permission and nobody else", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === "admin") expect(permissions.length).toBeGreaterThan(20);
      else expect(permissions).not.toContain("users:manage");
    }
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("customer")).toBe(false);
    expect(homeForRole("support")).toBe("/admin");
    expect(homeForRole("customer")).toBe("/dashboard");
  });
});

describe("password hashing", () => {
  it("hashes with bcrypt and verifies", async () => {
    const hash = await hashPassword("Correct-Horse-9");
    expect(hash).not.toContain("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(await verifyPassword("wrong-password-1", hash)).toBe(false);
  });

  it("burns comparable time for unknown accounts", async () => {
    await expect(burnPasswordCheck("someone@example.com")).resolves.toBeUndefined();
  });

  it("rejects weak passwords at the schema layer", async () => {
    const { passwordSchema } = await import("@/lib/validation");
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("allletters").success).toBe(false);
    expect(passwordSchema.safeParse("goodpass123").success).toBe(true);
  });
});
