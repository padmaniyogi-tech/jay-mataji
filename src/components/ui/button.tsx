import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300",
  secondary:
    "bg-surface text-ink border border-line hover:border-brand-300 hover:text-brand-800 disabled:text-ink-faint",
  accent: "bg-accent-500 text-white hover:bg-accent-600 disabled:bg-accent-200",
  ghost: "bg-transparent text-ink-soft hover:bg-brand-50 hover:text-brand-800",
  danger: "bg-danger text-white hover:bg-[#a81f31] disabled:opacity-60",
  subtle: "bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-100",
} as const;

const SIZES = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClasses(variant: ButtonVariant = "primary", size: keyof typeof SIZES = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  children: ReactNode;
};

export function Button({ variant = "primary", size = "md", className, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
