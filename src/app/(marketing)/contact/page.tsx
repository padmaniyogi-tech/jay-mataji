import type { Metadata } from "next";
import { Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ContactForm } from "@/components/marketing/contact-form";
import { getPlatformSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Contact",
  description: "Ask Amplifi a question about services, delivery evidence, refunds or a provider integration.",
};

export default async function ContactPage() {
  const settings = await getPlatformSettings();

  return (
    <div className="container-page py-12">
      <div className="max-w-3xl">
        <Badge tone="progress">Support</Badge>
        <h1 className="mt-4 text-4xl font-bold">Talk to a human</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Questions about a campaign, a report, a refund or connecting a delivery provider? Send a message and it
          lands in the support inbox — the same inbox your order notifications come from.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Send a message" description="No account required. Replies go to the email you enter." />
          <CardBody>
            <ContactForm />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Mail aria-hidden className="mt-0.5 h-4 w-4 text-brand-700" />
                <div>
                  <p className="font-medium text-ink">Support inbox</p>
                  <p className="text-ink-soft">{settings.supportEmail}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle aria-hidden className="mt-0.5 h-4 w-4 text-brand-700" />
                <div>
                  <p className="font-medium text-ink">Already have an order?</p>
                  <p className="text-ink-soft">
                    Open the order and use Support so the thread is attached to the campaign and its delivery
                    evidence.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 text-brand-700" />
                <div>
                  <p className="font-medium text-ink">We never ask for credentials</p>
                  <p className="text-ink-soft">
                    Please never send an Instagram password, session cookie or access token. We only need a public
                    profile, post or Reel URL.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="text-xs leading-relaxed text-ink-soft">
              Demo environment: email delivery is captured to the local outbox instead of being sent, so nothing
              leaves this machine. In production the same form posts to your configured email provider.
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
