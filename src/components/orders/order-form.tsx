"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { AUDIENCE_COUNTRIES } from "@/lib/countries";
import type { Quote } from "@/lib/pricing";

type ServiceSummary = {
  slug: string;
  name: string;
  kind: string;
  unitLabel: string;
  unitPricePaise: number;
  fixedFeePaise: number;
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
  estimatedDurationHours: number;
  requiresContentUrl: boolean;
  requiresAudience: boolean;
  requiresBrief: boolean;
  requiresManualReview: boolean;
  limitations: string;
  eligibility: string;
};

type PackageOption = { id: string; name: string; description: string | null; quantity: number; pricePaise: number };

type QuoteResponse = {
  ok: boolean;
  data?: {
    quote: Quote;
    couponMessage: string | null;
    targetError: string | null;
  };
  error?: { message: string; details?: Array<{ path: string; message: string }> };
};

export function OrderForm({
  service,
  packages,
  authenticated,
}: {
  service: ServiceSummary;
  packages: PackageOption[];
  authenticated: boolean;
}) {
  const router = useRouter();
  const [targetUrl, setTargetUrl] = useState("");
  const [quantity, setQuantity] = useState<number>(Math.min(Math.max(service.minQuantity, service.quantityStep), service.maxQuantity));
  const [packageId, setPackageId] = useState<string>("");
  const [audienceCountry, setAudienceCountry] = useState("IN");
  const [brief, setBrief] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const selectedPackage = packages.find((p) => p.id === packageId);
  const effectiveQuantity = selectedPackage ? selectedPackage.quantity : quantity;

  const quantityHint = useMemo(
    () =>
      `Between ${formatNumber(service.minQuantity)} and ${formatNumber(service.maxQuantity)} ${service.unitLabel}, in steps of ${formatNumber(service.quantityStep)}.`,
    [service],
  );

  // Debounced server-side quote (never calculated only in the browser).
  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!Number.isFinite(effectiveQuantity) || effectiveQuantity <= 0) return;
      setQuoteLoading(true);
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            serviceSlug: service.slug,
            quantity: effectiveQuantity,
            couponCode: couponCode.trim() || undefined,
          }),
        });
        const json = (await res.json()) as QuoteResponse;
        if (json.ok && json.data) {
          setQuote(json.data.quote);
          setQuoteError(null);
          setCouponMessage(json.data.couponMessage);
        } else {
          setQuote(null);
          setQuoteError(json.error?.message ?? "Could not calculate a price.");
          setCouponMessage(null);
        }
      } catch {
        setQuoteError("Network error while pricing. Check your connection.");
      } finally {
        setQuoteLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [service.slug, effectiveQuantity, couponCode]);

  function validateUrl(value: string): string | null {
    if (!value.trim()) return "Enter an Instagram profile or post URL.";
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ""))) return "Only instagram.com links are supported.";
      if (service.requiresContentUrl && !/\/(p|reel|reels|tv)\//i.test(url.pathname)) {
        return "This service needs a post or Reel link (…/p/… or …/reel/…).";
      }
      if (!service.requiresContentUrl && service.kind === "followers" && !/^\/[A-Za-z0-9._]+\/?$/.test(url.pathname)) {
        return "Use the profile URL, e.g. https://www.instagram.com/yourbrand/";
      }
      return null;
    } catch {
      return "That doesn't look like a valid URL.";
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!authenticated) {
      router.push(`/login?next=${encodeURIComponent(`/services/${service.slug}`)}`);
      return;
    }

    const urlIssue = validateUrl(targetUrl);
    setUrlError(urlIssue);
    if (urlIssue) return;

    if (service.requiresBrief && brief.trim().length < 20) {
      setFieldErrors({ brief: "Add at least 20 characters so the campaign team can route this properly." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceSlug: service.slug,
          targetUrl,
          quantity: effectiveQuantity,
          audienceCountry: service.requiresAudience ? audienceCountry : undefined,
          brief: brief.trim() || undefined,
          packageId: packageId || undefined,
          couponCode: couponCode.trim() || undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { order: { publicId: string }; warning: string | null };
        error?: { message: string; details?: Array<{ path: string; message: string }> };
      };
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/services/${service.slug}`)}`);
        return;
      }
      if (!json.ok || !json.data) {
        const details: Record<string, string> = {};
        for (const issue of json.error?.details ?? []) details[issue.path] = issue.message;
        setFieldErrors(details);
        setFormError(json.error?.message ?? "Could not create the order.");
        return;
      }
      router.push(`/dashboard/checkout/${json.data.order.publicId}`);
    } catch {
      setFormError("Network error. Your card was not charged — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field
        label={service.requiresContentUrl ? "Instagram post or Reel URL" : "Instagram profile URL"}
        htmlFor="targetUrl"
        hint={
          service.requiresContentUrl
            ? "Public post, Reel or IGTV link. Example: https://www.instagram.com/reel/ABC123/"
            : "Public profile link. Example: https://www.instagram.com/yourbrand/"
        }
        error={urlError}
      >
        <Input
          id="targetUrl"
          name="targetUrl"
          inputMode="url"
          autoComplete="url"
          placeholder={service.requiresContentUrl ? "https://www.instagram.com/reel/…" : "https://www.instagram.com/yourbrand/"}
          value={targetUrl}
          onChange={(e) => {
            setTargetUrl(e.target.value);
            if (urlError) setUrlError(null);
          }}
          aria-invalid={Boolean(urlError)}
          required
        />
      </Field>

      {packages.length > 0 && (
        <Field label="Package (optional)" htmlFor="packageId" hint="Packages fix the quantity and price. Leave blank for a custom quantity.">
          <Select
            id="packageId"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            disabled={submitting}
          >
            <option value="">Custom quantity</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} · {formatNumber(pkg.quantity)} {service.unitLabel} · {formatPaise(pkg.pricePaise)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label={`Target quantity (${service.unitLabel})`}
        htmlFor="quantity"
        hint={selectedPackage ? "Quantity is fixed by the selected package." : quantityHint}
        error={fieldErrors.quantity}
      >
        <Input
          id="quantity"
          name="quantity"
          type="number"
          min={service.minQuantity}
          max={service.maxQuantity}
          step={service.quantityStep}
          value={effectiveQuantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          disabled={Boolean(selectedPackage) || submitting}
          required
        />
      </Field>

      {service.requiresAudience && (
        <Field label="Target audience country" htmlFor="audienceCountry" hint="Delivery is targeted to this market." error={fieldErrors.audienceCountry}>
          <Select id="audienceCountry" value={audienceCountry} onChange={(e) => setAudienceCountry(e.target.value)} disabled={submitting}>
            {AUDIENCE_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {(service.requiresBrief || service.requiresManualReview) && (
        <Field
          label={service.requiresBrief ? "Campaign brief" : "Campaign brief (optional but recommended)"}
          htmlFor="brief"
          hint="Goal, audience, key message, deadlines, and any creative links. Never share account passwords."
          error={fieldErrors.brief}
        >
          <Textarea
            id="brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={2000}
            required={service.requiresBrief}
            placeholder="We're launching a festive collection. Target 18–34 in metro India. Link the Reel in the brief; no discount codes over 20%."
            disabled={submitting}
          />
          <p className="mt-1 text-right text-xs text-ink-faint">{brief.length}/2000</p>
        </Field>
      )}

      <Field label="Coupon code (optional)" htmlFor="couponCode" hint={couponMessage ?? undefined} error={fieldErrors.couponCode}>
        <Input
          id="couponCode"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          placeholder="WELCOME10"
          disabled={submitting}
          autoCapitalize="characters"
        />
      </Field>

      {/* Price summary */}
      <div className="rounded-2xl border border-line bg-canvas/70 p-4" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Price estimate</p>
        {quoteError ? (
          <p className="mt-2 text-sm text-danger">{quoteError}</p>
        ) : quote ? (
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">
                {formatNumber(quote.quantity)} × {formatPaise(quote.unitPricePaise)}
              </span>
              <span className="tabular-nums">{formatPaise(quote.subtotalPaise)}</span>
            </div>
            {quote.fixedFeePaise > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-soft">Campaign management fee</span>
                <span className="tabular-nums">{formatPaise(quote.fixedFeePaise)}</span>
              </div>
            )}
            {quote.discountPaise > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount {quote.couponCode ? `(${quote.couponCode})` : ""}</span>
                <span className="tabular-nums">−{formatPaise(quote.discountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between text-ink-soft">
              <span>GST ({(quote.taxRateBps / 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{formatPaise(quote.taxPaise)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatPaise(quote.totalPaise)}</span>
            </div>
            {quoteLoading && <p className="text-xs text-ink-faint">Updating…</p>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-faint">{quoteLoading ? "Calculating…" : "Enter a quantity to see the price."}</p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Final price is recalculated on the server at checkout. Estimated delivery: {service.estimatedDurationHours} hours.
        </p>
      </div>

      {formError && <Alert tone="danger" title="We couldn't start this order">{formError}</Alert>}

      <div className="space-y-3">
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!quote}>
          {authenticated ? "Start order" : "Sign in to start order"}
        </Button>
        {!authenticated && (
          <p className="text-center text-xs text-ink-faint">
            New here?{" "}
            <Link href={`/register?next=${encodeURIComponent(`/services/${service.slug}`)}`} className="link">
              Create an account
            </Link>{" "}
            — it takes under a minute.
          </p>
        )}
        {service.requiresManualReview && (
          <p className="text-center text-xs text-ink-faint">
            This service is reviewed by our campaign team before a provider is assigned.
          </p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-faint">
        Limits: {service.limitations}
      </p>
      {authenticated && (
        <ButtonLink href="/dashboard/settings" variant="ghost" size="sm" className="w-full">
          Review your notification settings
        </ButtonLink>
      )}
    </form>
  );
}
