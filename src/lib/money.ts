/**
 * Money is always handled as integer paise (1 INR = 100 paise).
 * Never use floats for money anywhere in this codebase.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}

export function formatPaiseParts(paise: number): { rupees: string; decimals: string } {
  const formatted = inr.format(paise / 100);
  // en-IN formats as "₹1,234.50" or "₹1,234"
  const idx = formatted.lastIndexOf(".");
  if (idx === -1) return { rupees: formatted, decimals: "" };
  return { rupees: formatted.slice(0, idx), decimals: formatted.slice(idx + 1) };
}

export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error("Amount must be a finite, non-negative number of rupees.");
  }
  return Math.round(rupees * 100);
}

export function percentOf(base: number, basisPoints: number): number {
  return Math.round((base * basisPoints) / 10_000);
}

export function applyPercentBps(amountPaise: number, rateBps: number, round: "half-up" | "down" = "half-up"): number {
  const raw = (amountPaise * rateBps) / 10_000;
  return round === "down" ? Math.floor(raw) : Math.round(raw);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
