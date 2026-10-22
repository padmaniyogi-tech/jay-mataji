import { redirect } from "next/navigation";
import { getSessionUser, canAccessAdmin } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { unreadNotificationCount } from "@/lib/notifications";
import { openTicketCount } from "@/lib/support";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { DemoBanner } from "@/components/layout/demo-banner";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabaseReady();
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!canAccessAdmin(user)) redirect("/dashboard");

  const [unread, tickets] = await Promise.all([unreadNotificationCount(user.id), openTicketCount()]);

  const all: Array<NavItem & { permission?: Parameters<typeof hasPermission>[1] }> = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/orders", label: "Orders", permission: "orders:read:all" },
    { href: "/admin/refunds", label: "Refunds", permission: "refunds:approve" },
    { href: "/admin/customers", label: "Customers", permission: "users:read" },
    { href: "/admin/providers", label: "Providers", permission: "providers:read" },
    { href: "/admin/services", label: "Services & pricing", permission: "services:manage" },
    { href: "/admin/coupons", label: "Coupons", permission: "coupons:manage" },
    { href: "/admin/tickets", label: "Tickets", badge: tickets, permission: "tickets:manage" },
    { href: "/admin/audit", label: "Audit log", permission: "audit:read" },
    { href: "/admin/settings", label: "Settings", permission: "settings:manage" },
    { href: "/admin/notifications", label: "Notifications", badge: unread },
  ];

  const nav = all
    .filter((item) => !item.permission || hasPermission(user.role, item.permission))
    .map(({ permission: _permission, ...item }) => item);

  return (
    <>
      <DemoBanner />
      <AppShell user={user} nav={nav} title="Admin" variant="admin">
        {children}
      </AppShell>
    </>
  );
}
