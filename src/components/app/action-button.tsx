"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type ApiResult = { ok: boolean; data?: Record<string, unknown>; error?: { message: string; details?: unknown } };

export async function callApi(endpoint: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<ApiResult> {
  const res = await fetch(endpoint, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: ApiResult = { ok: false, error: { message: "Unexpected server response." } };
  try {
    json = (await res.json()) as ApiResult;
  } catch {
    // keep default
  }
  if (!res.ok) return { ...json, ok: false, error: json.error ?? { message: `Request failed (${res.status})` } };
  return json;
}

export function ActionButton({
  endpoint,
  body,
  label,
  pendingLabel,
  variant = "secondary",
  size = "sm",
  confirmMessage,
  redirectTo,
  className,
  onDone,
}: {
  endpoint: string;
  body: unknown;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  confirmMessage?: string;
  redirectTo?: string;
  className?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await callApi(endpoint, body);
      if (!result.ok) {
        setError(result.error?.message ?? "Action failed.");
        return;
      }
      setSuccess((result.data?.message as string) ?? "Done.");
      onDone?.();
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant={variant} size={size} onClick={run} loading={loading} className={className} type="button">
        {loading ? (pendingLabel ?? "Working…") : label}
      </Button>
      {error && (
        <span role="alert" className={cn("max-w-xs text-xs font-medium text-danger")}>
          {error}
        </span>
      )}
      {success && !error && <span className="max-w-xs text-xs font-medium text-success">{success}</span>}
    </span>
  );
}
