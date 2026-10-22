import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";

const NAV = [
  { href: "/demo", label: "Try demo" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm font-medium text-ink-soft transition hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {isStaff(user.role) && (
                <ButtonLink href="/admin" variant="secondary" size="sm" className="hidden sm:inline-flex">
                  Admin
                </ButtonLink>
              )}
              <ButtonLink href="/dashboard" size="sm">
                Dashboard
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Start a campaign
              </ButtonLink>
            </>
          )}
        </div>
      </div>
      <div className="container-page flex items-center gap-4 overflow-x-auto pb-3 md:hidden">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap text-xs font-medium text-ink-soft">
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
