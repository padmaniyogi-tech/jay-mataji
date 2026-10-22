import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailAction } from "@/components/auth/forms";
import { Alert } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Verify your email" subtitle="Verification unlocks order creation and keeps your account recoverable.">
      {token ? (
        <VerifyEmailAction token={token} />
      ) : (
        <Alert tone="info" title="No token found">
          Open the verification link from your inbox, or resend it from your account settings.
        </Alert>
      )}
    </AuthShell>
  );
}
