import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { CheckCircle2 } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Amplifi home">
          <LogoMark />
          <span className="text-base font-bold tracking-tight">Amplifi</span>
        </Link>
        <h1 className="mt-6 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
        <div className="mt-7">{children}</div>
        {footer && <div className="mt-6 text-sm text-ink-soft">{footer}</div>}
      </div>
      <aside className="hidden rounded-3xl border border-line bg-surface/70 p-8 lg:block">
        <p className="eyebrow">Why teams use Amplifi</p>
        <ul className="mt-5 space-y-4 text-sm text-ink-soft">
          {[
            "Transparent per-unit pricing with GST shown before checkout.",
            "Automated routing to authorized advertising, approved partners or vetted creators.",
            "Verified reporting: requested, provider-reported and verified numbers stay separate.",
            "No bots, no fake accounts, no password requests — ever.",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 rounded-2xl border border-line bg-canvas/60 p-4 text-xs leading-relaxed text-ink-faint">
          Campaign results are never guaranteed. Where a provider cannot report a metric, your dashboard says
          &ldquo;Metric unavailable&rdquo; instead of inventing a number.
        </div>
      </aside>
    </div>
  );
}
