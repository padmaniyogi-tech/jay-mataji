import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M4 16.5 9 8l3.2 5.4L15 9.5l5 7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18.5" cy="6" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Amplifi home">
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[17px] font-bold tracking-tight text-ink">Amplifi</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">Campaign platform</span>
        </span>
      )}
    </Link>
  );
}
