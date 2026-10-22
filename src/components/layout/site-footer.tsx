import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/services", label: "Services & pricing" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/dashboard", label: "Customer dashboard" },
      { href: "/register", label: "Create an account" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact & support" },
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/refund", label: "Refund policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface/70">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-base font-bold tracking-tight">Amplifi</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
            A campaign ordering platform for Instagram growth. Delivery comes from authorized advertising, approved
            promotional partners or vetted creators — never bots, bought accounts or automated engagement.
          </p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-ink-faint">
            We never guarantee follower counts, views, likes or virality. Reported results are attributed to the
            campaign only when a provider or verified report supports them, and are always shown separately from your
            account&apos;s organic numbers.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{column.title}</p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink-soft transition hover:text-brand-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-ink-faint">
          <p>© {new Date().getFullYear()} Amplifi. Built in India. Not affiliated with Instagram or Meta.</p>
          <p>Instagram is a trademark of Meta Platforms, Inc.</p>
        </div>
      </div>
    </footer>
  );
}
