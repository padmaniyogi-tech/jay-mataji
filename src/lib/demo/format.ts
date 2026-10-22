/**
 * Deterministic display formatting for the public demo.
 *
 * `Number.prototype.toLocaleString("en-IN")` / `toLocaleTimeString()` depend on the ICU
 * data shipped with the runtime. Node and the browser can disagree (grouping separators,
 * timezone names, narrow spaces), which produces a server/client text mismatch — i.e. a
 * real React hydration error. These helpers format with plain string maths so the markup
 * is byte-identical in every environment.
 */

/** Groups digits in the Indian convention: 1,00,000 (last three, then pairs). */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const negative = value < 0;
  const digits = Math.trunc(Math.abs(value)).toString();
  if (digits.length <= 3) return `${negative ? "-" : ""}${digits}`;

  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped},${last3}`;
}

/** `HH:MM:SS UTC` from an ISO timestamp — no locale or timezone lookup involved. */
export function formatUtcTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}
