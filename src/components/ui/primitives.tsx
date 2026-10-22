import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------- Card --------------------------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("surface", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/* --------------------------------- Badge --------------------------------- */

export type Tone = "neutral" | "info" | "progress" | "success" | "warn" | "danger" | "demo";

const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border-line",
  info: "bg-info-soft text-info border-info/20",
  progress: "bg-brand-50 text-brand-800 border-brand-200",
  success: "bg-success-soft text-success border-success/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  demo: "bg-accent-50 text-accent-800 border-accent-300",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-ink-faint",
    info: "bg-info",
    progress: "bg-brand-500",
    success: "bg-success",
    warn: "bg-warn",
    danger: "bg-danger",
    demo: "bg-accent-500",
  };
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", colors[tone])} />;
}

/* --------------------------------- Alert --------------------------------- */

const ALERTS: Record<Tone, string> = {
  neutral: "border-line bg-canvas text-ink-soft",
  info: "border-info/25 bg-info-soft text-[#1e3a8a]",
  progress: "border-brand-200 bg-brand-50 text-brand-900",
  success: "border-success/25 bg-success-soft text-[#075c43]",
  warn: "border-warn/25 bg-warn-soft text-[#78350f]",
  danger: "border-danger/25 bg-danger-soft text-[#8a1424]",
  demo: "border-accent-300 bg-accent-50 text-accent-900",
};

export function Alert({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", ALERTS[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-1", "leading-relaxed")}>{children}</div>}
    </div>
  );
}

/* -------------------------------- Progress ------------------------------- */

export function Progress({
  value,
  label,
  tone = "progress",
  demo = false,
}: {
  value: number | null;
  label?: string;
  tone?: "progress" | "success" | "warn";
  demo?: boolean;
}) {
  const pct = value === null ? null : Math.max(0, Math.min(100, value));
  const colors = { progress: "bg-brand-500", success: "bg-success", warn: "bg-accent-500" };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-soft">
        <span>{label ?? "Progress"}</span>
        <span className="tabular-nums">{pct === null ? "Metric unavailable" : `${pct}%`}</span>
      </div>
      <div
        className={cn("h-2.5 w-full overflow-hidden rounded-full bg-line/70", demo && "demo-stripe")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={pct === null ? "Measurement unavailable" : `${pct}%`}
      >
        {pct !== null && <div className={cn("h-full rounded-full transition-all duration-700", colors[tone])} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  );
}

/* ------------------------------- Empty state ----------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{icon}</div>}
      <div>
        <p className="text-base font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Stats -------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const content = (
    <div className="surface h-full p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <div className={cn("mt-1 text-xs", tone === "demo" ? "text-accent-700" : "text-ink-faint")}>{hint}</div>}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lift">
        {content}
      </a>
    );
  }
  return content;
}

/* ---------------------------------- Table -------------------------------- */

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("surface overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("border-b border-line bg-canvas/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-faint", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-line/70 px-4 py-3 align-middle text-ink-soft", className)}>{children}</td>;
}
