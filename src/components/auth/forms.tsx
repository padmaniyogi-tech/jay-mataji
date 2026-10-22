"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";

type ApiError = { error?: { message: string; details?: Array<{ path: string; message: string }> } };

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: ApiError & { data?: unknown } }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: ApiError & { data?: unknown } = {};
  try {
    json = (await res.json()) as ApiError;
  } catch {
    json = { error: { message: "Unexpected server response." } };
  }
  return { ok: res.ok, status: res.status, json };
}

function toFieldErrors(details?: Array<{ path: string; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of details ?? []) out[issue.path] = issue.message;
  return out;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const result = await post("/api/auth/login", { email, password });
      if (!result.ok) {
        setError(result.json.error?.message ?? "Could not sign in.");
        setFields(toFieldErrors(result.json.error?.details));
        return;
      }
      const data = result.json.data as { redirectTo: string };
      router.push(next && next.startsWith("/") ? next : data.redirectTo);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={fields.email}>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fields.password}
        action={
          <Link href="/forgot-password" className="text-xs font-medium text-brand-700 hover:underline">
            Forgot password?
          </Link>
        }
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" loading={loading}>
        Sign in
      </Button>
      <p className="text-center text-sm text-ink-soft">
        New to Amplifi?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="link">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [form, setForm] = useState({ name: "", email: "", password: "", marketingOptIn: false, accept: false });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.accept) {
      setError("Please accept the terms and refund policy to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const result = await post("/api/auth/register", {
        name: form.name,
        email: form.email,
        password: form.password,
        marketingOptIn: form.marketingOptIn,
      });
      if (!result.ok) {
        setError(result.json.error?.message ?? "Could not create your account.");
        setFields(toFieldErrors(result.json.error?.details));
        return;
      }
      router.push(next && next.startsWith("/") ? next : "/dashboard?welcome=1");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Full name" htmlFor="name" error={fields.name}>
        <Input id="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Email" htmlFor="email" error={fields.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters, including a letter and a number."
        error={fields.password}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
      </Field>
      <Checkbox
        label="Email me occasional product updates"
        description="Transactional emails about orders and security are always sent."
        checked={form.marketingOptIn}
        onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })}
      />
      <Checkbox
        label="I accept the terms, privacy and refund policies"
        description="You must be authorized to promote the Instagram account you submit."
        checked={form.accept}
        onChange={(e) => setForm({ ...form, accept: e.target.checked })}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" loading={loading}>
        Create account
      </Button>
      <p className="text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="link">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs leading-relaxed text-ink-faint">
        We never ask for your Instagram password. Read our{" "}
        <Link href="/legal/privacy" className="link">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await post("/api/auth/forgot-password", { email });
      if (!result.ok) {
        setError(result.json.error?.message ?? "Could not send the reset link.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" title="Check your inbox">
        If an account exists for {email}, a password reset link is on its way. In demo mode, emails are captured in the
        server mailbox (admin → Mail outbox). The link expires in 60 minutes.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" loading={loading}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-ink-soft">
        <Link href="/login" className="link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await post("/api/auth/reset-password", { token, password });
      if (!result.ok) {
        setError(result.json.error?.message ?? "Could not reset your password.");
        setFields(toFieldErrors(result.json.error?.details));
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1800);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title="Password updated">
        All existing sessions were signed out. Redirecting you to sign in…
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" htmlFor="password" hint="At least 10 characters, including a letter and a number." error={fields.password}>
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" loading={loading}>
        Update password
      </Button>
    </form>
  );
}

export function VerifyEmailAction({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    setState("loading");
    try {
      const result = await post("/api/auth/verify-email", { token });
      if (!result.ok) {
        setMessage(result.json.error?.message ?? "This link is invalid or expired.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setMessage("Network error. Please try again.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Email verified">
          Your account is verified. You can now place orders.
        </Alert>
        <Link href="/dashboard" className="link text-sm">
          Go to dashboard →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state === "error" && <Alert tone="danger">{message}</Alert>}
      <Button onClick={verify} loading={state === "loading"} className="w-full">
        Verify my email
      </Button>
      <p className="text-center text-xs text-ink-faint">
        We ask you to click a button so email scanners cannot verify the address automatically.
      </p>
    </div>
  );
}

export function ResendVerificationButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function resend() {
    setState("sending");
    const result = await post("/api/auth/resend-verification", {});
    setState(result.ok ? "sent" : "error");
  }
  return (
    <Button variant="secondary" size="sm" onClick={resend} loading={state === "sending"} disabled={state === "sent"}>
      {state === "sent" ? "Verification email sent" : state === "error" ? "Try again" : "Resend verification email"}
    </Button>
  );
}
