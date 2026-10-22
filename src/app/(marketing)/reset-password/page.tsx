import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password" subtitle="Resetting your password signs out every existing session.">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="warn" title="Missing reset token">
            Open the link from your reset email, or request a new one.
          </Alert>
          <Link href="/forgot-password" className="link text-sm">
            Request a new link →
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
