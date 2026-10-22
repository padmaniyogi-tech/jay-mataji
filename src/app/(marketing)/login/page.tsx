import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { getSessionUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeForRole(user.role));
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to track campaigns, download reports and manage your account.">
      <Suspense fallback={<div className="h-64 skeleton" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
