import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";
import { getSessionUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect(homeForRole(user.role));
  return (
    <AuthShell
      title="Create your Amplifi account"
      subtitle="One account for campaigns, reports, refunds and support. No Instagram credentials required."
    >
      <Suspense fallback={<div className="h-96 skeleton" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
