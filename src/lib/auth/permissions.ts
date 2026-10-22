import type { UserRole } from "@/lib/db/schema";

export const PERMISSIONS = [
  "orders:read:own",
  "orders:read:all",
  "orders:manage",
  "orders:retry_provider",
  "orders:assign_provider",
  "payments:read",
  "refunds:request",
  "refunds:approve",
  "refunds:process",
  "providers:read",
  "providers:manage",
  "providers:test",
  "services:manage",
  "coupons:manage",
  "users:read",
  "users:manage",
  "tickets:read:own",
  "tickets:manage",
  "settings:manage",
  "audit:read",
  "analytics:read",
  "emails:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CUSTOMER: Permission[] = ["orders:read:own", "refunds:request", "tickets:read:own"];

const SUPPORT: Permission[] = [
  "orders:read:all",
  "orders:manage",
  "orders:retry_provider",
  "orders:assign_provider",
  "users:read",
  "tickets:manage",
  "refunds:request",
  "providers:read",
];

const FINANCE: Permission[] = [
  "orders:read:all",
  "payments:read",
  "refunds:approve",
  "refunds:process",
  "refunds:request",
  "analytics:read",
  "users:read",
];

const ADMIN: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  customer: CUSTOMER,
  support: SUPPORT,
  finance: FINANCE,
  admin: ADMIN,
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isStaff(role: UserRole): boolean {
  return role === "admin" || role === "support" || role === "finance";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Customer",
  support: "Support agent",
  finance: "Finance",
  admin: "Administrator",
};

/** Landing page per role after login. */
export function homeForRole(role: UserRole): string {
  return role === "customer" ? "/dashboard" : "/admin";
}
