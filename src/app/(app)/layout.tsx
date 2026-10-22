import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { unreadNotificationCount } from "@/lib/notifications";
import { openTicketCount } from "@/lib/support";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { DemoBanner } from "@/components/layout/demo-banner";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabaseReady();
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  const [unread, openTickets] = await Promise.all([unreadNotificationCount(user.id), openTicketCount()]);

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/orders", label: "Orders" },
    { href: "/dashboard/notifications", label: "Notifications", badge: unread },
    { href: "/dashboard/support", label: "Support", badge: 0 },
    { href: "/dashboard/settings", label: "Account settings" },
  ];

  void openTickets;

  return (
    <>
      <DemoBanner />
      <AppShell user={user} nav={nav} title="Your campaigns" variant="customer">
        {children}
      </AppShell>
    </>
  );
}
