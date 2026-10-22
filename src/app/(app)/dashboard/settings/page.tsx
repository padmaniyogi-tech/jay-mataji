import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ProfileForm, PasswordForm } from "@/components/app/profile-forms";
import { ResendVerificationButton } from "@/components/auth/forms";
import { ROLE_LABELS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Account settings</h2>
        <p className="mt-1 text-sm text-ink-soft">Manage your profile, password and email verification.</p>
      </div>

      <Card>
        <CardHeader
          title="Account"
          description="Email addresses cannot be changed from the dashboard — contact support from your registered address."
          action={<Badge tone="neutral">{ROLE_LABELS[user.role]}</Badge>}
        />
        <CardBody className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Email</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{user.email}</span>
                {user.emailVerifiedAt ? <Badge tone="success">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Member since</dt>
              <dd className="mt-0.5 text-ink">{formatDateTime(user.createdAt)}</dd>
            </div>
          </dl>
          {!user.emailVerifiedAt && (
            <Alert tone="warn" title="Email not verified">
              Verify to unlock order creation and payment receipts.
              <div className="mt-2">
                <ResendVerificationButton />
              </div>
            </Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Profile" description="Shown on invoices and used by our support team." />
        <CardBody>
          <ProfileForm
            name={user.name}
            company={user.company}
            phone={user.phone}
            marketingOptIn={user.marketingOptIn}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Password" description="Changing your password signs out every other session." />
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Security & privacy" />
        <CardBody className="space-y-2 text-sm text-ink-soft">
          <p>We never ask for your Instagram password, session cookies, 2FA codes or access tokens. Anyone who does is not us.</p>
          <p>
            Session cookies are HTTP-only, SameSite=Lax and secure in production. Sensitive actions are rate limited and
            written to an audit log.
          </p>
          <p>
            Data export and deletion requests: email support from your registered address; we respond within the period
            required by applicable Indian data-protection rules.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
