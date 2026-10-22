"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { initials } from "@/lib/format";
import type { SessionUser } from "@/lib/auth/session";

export type NavItem = { href: string; label: string; badge?: number };

export function AppShell({
  user,
  nav,
  title,
  children,
  variant = "customer",
}: {
  user: SessionUser;
  nav: NavItem[];
  title: string;
  children: ReactNode;
  variant?: "customer" | "admin";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r border-line bg-surface lg:sticky lg:top-0 lg:h-screen",
          open ? "block" : "hidden lg:block",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Logo href={variant === "admin" ? "/admin" : "/dashboard"} />
            <button className="text-sm text-ink-faint lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              ✕
            </button>
          </div>
          <div className="px-4 pt-4">
            <Badge tone={variant === "admin" ? "progress" : "neutral"}>
              {variant === "admin" ? "Admin console" : "Customer account"}
            </Badge>
          </div>
          <nav aria-label="Sidebar" className="mt-3 flex-1 space-y-1 px-3 pb-4">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition",
                    active ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-canvas hover:text-ink",
                  )}
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-faint">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {variant === "admin" && (
                <Link href="/dashboard" className="text-xs font-medium text-brand-700 hover:underline">
                  ← Customer view
                </Link>
              )}
              {variant === "customer" && (user.role === "admin" || user.role === "support" || user.role === "finance") && (
                <Link href="/admin" className="text-xs font-medium text-brand-700 hover:underline">
                  Admin console →
                </Link>
              )}
              <Button variant="secondary" size="sm" onClick={signOut} loading={signingOut}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                className="rounded-lg border border-line px-2.5 py-1.5 text-sm lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                ☰
              </button>
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/services" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
                New order
              </Link>
              <Link
                href={variant === "admin" ? "/admin/notifications" : "/dashboard/notifications"}
                className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:border-brand-300"
                aria-label="Notifications"
              >
                🔔
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
