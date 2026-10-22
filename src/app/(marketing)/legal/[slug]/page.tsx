import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlatformSettings } from "@/lib/settings";

type LegalDoc = { title: string; updated: string; sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }> };

const DOCS: Record<string, LegalDoc> = {
  terms: {
    title: "Terms of service",
    updated: "2026-01-15",
    sections: [
      {
        heading: "1. What Amplifi is",
        paragraphs: [
          "Amplifi is a campaign ordering platform. We accept orders for promotional campaigns and route them to authorized advertising accounts, approved promotional partners or vetted creators. We are not affiliated with Instagram or Meta.",
          "Placing an order does not, by itself, create followers, views or likes. Delivery requires an eligible provider and, for advertising, a properly configured ad account.",
        ],
      },
      {
        heading: "2. Your account",
        bullets: [
          "You must provide accurate information and keep your credentials secure.",
          "You are responsible for ensuring you are authorized to promote the Instagram account or content you submit.",
          "You must not submit content that violates platform policies, law, or third-party rights.",
          "We may suspend accounts for abuse, fraud, chargeback abuse or attempts to circumvent limits.",
        ],
      },
      {
        heading: "3. No guaranteed outcomes",
        paragraphs: [
          "Follower counts, views, likes, reach and virality are never guaranteed. Advertising delivery depends on auctions, creative quality and platform policy. Creator outcomes depend on audience response.",
          "Where a provider reports less than the requested target, we reconcile the order as partially completed and you may request a refund for the undelivered portion, subject to the refund policy.",
        ],
      },
      {
        heading: "4. Prohibited services",
        paragraphs: [
          "We do not provide fake accounts, bots, automated follows/likes/views, credential collection, scraping, or access to unauthorized Instagram endpoints. Requests for such services will be refused and may result in account termination.",
        ],
      },
      {
        heading: "5. Payments, taxes and pricing",
        paragraphs: [
          "Prices are displayed in INR and recalculated server-side. GST is applied where configured. Payment is captured by Razorpay; we never store card numbers or CVV.",
          "An order is not actionable until payment is verified server-side.",
        ],
      },
      {
        heading: "6. Liability",
        paragraphs: [
          "To the maximum extent permitted by law, our aggregate liability for an order is limited to the amount you paid for that order. We are not liable for platform policy changes, account restrictions imposed by Instagram, or third-party provider outages beyond our reasonable control.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    updated: "2026-01-15",
    sections: [
      {
        heading: "Data we collect",
        bullets: [
          "Account data: name, email, hashed password, optional company and phone.",
          "Campaign data: public Instagram URLs, quantity, audience country and campaign briefs you submit.",
          "Payment metadata: gateway order/payment ids and status. Card data never reaches our servers.",
          "Operational data: audit logs, IP address, user agent, and job/provider events needed to operate the service.",
        ],
      },
      {
        heading: "What we never collect",
        paragraphs: [
          "We never ask for your Instagram password, session cookies or access tokens. Do not paste them into any field; if someone asks you to, report it to support.",
        ],
      },
      {
        heading: "How we use data",
        bullets: [
          "To create and deliver your orders, route them to providers and report results.",
          "To prevent fraud, abuse and duplicate payments, and to meet legal obligations.",
          "To send transactional notifications (order status, refunds, security). Marketing email is opt-in.",
        ],
      },
      {
        heading: "Sharing",
        paragraphs: [
          "We share the minimum necessary campaign data with the selected provider (for example, the public post URL and target quantity). Payment data is processed by Razorpay. We do not sell personal data.",
        ],
      },
      {
        heading: "Retention",
        paragraphs: [
          "Order, payment and audit records are retained for accounting and dispute resolution. Campaign briefs and uploaded creative are retained while the account is active and deleted on request where no legal obligation requires retention.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can request access, correction or deletion of your personal data by contacting support. Deleting an account does not remove records we must retain for tax or fraud-prevention purposes.",
        ],
      },
      {
        heading: "Security",
        paragraphs: [
          "Passwords are hashed with bcrypt. Sessions use opaque tokens stored hashed, in HttpOnly SameSite cookies. Provider credentials are encrypted at rest with AES-256-GCM. All state-changing endpoints validate input, check authorization and are rate-limited.",
        ],
      },
    ],
  },
  refund: {
    title: "Refund policy",
    updated: "2026-01-15",
    sections: [
      {
        heading: "1. Before delivery starts",
        paragraphs: [
          "If you cancel an order before a provider has started delivery, we cancel it and open a full refund for the captured amount. Refunds require finance approval and are processed to the original payment method.",
        ],
      },
      {
        heading: "2. Partial delivery",
        paragraphs: [
          "Where a provider reports delivery below the requested target, the order is marked partially completed. You may request a refund for the undelivered portion. The suggested amount is calculated from the best available delivered number — verified numbers where they exist, otherwise provider-reported numbers.",
        ],
      },
      {
        heading: "3. Failed campaigns",
        paragraphs: [
          "If a campaign fails before any delivery, or a provider rejects it, we automatically open a refund review and notify you. If the provider fails mid-campaign, the refund amount reflects what was actually delivered.",
        ],
      },
      {
        heading: "4. What is not refundable",
        bullets: [
          "Advertising budget already spent in the auction (Meta does not return spent budget).",
          "Completed campaigns where verified delivery meets the requested target.",
          "Creator work already published or delivered as contracted.",
          "Orders blocked by a violation of our terms or platform policy.",
        ],
      },
      {
        heading: "5. Timing",
        paragraphs: [
          "Approved refunds are submitted to the gateway immediately. Bank settlement typically takes 5–7 working days and depends on your bank. You will see the gateway reference in your order timeline.",
        ],
      },
      {
        heading: "6. Duplicate protection",
        paragraphs: [
          "Refund amounts are clamped to the captured payment minus refunds already processed or in flight. A refund can never be issued twice; repeated gateway webhooks are de-duplicated.",
        ],
      },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOCS[slug];
  return { title: doc?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();
  const settings = await getPlatformSettings();

  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-4xl font-bold">{doc.title}</h1>
      <p className="mt-2 text-sm text-ink-faint">Last updated {doc.updated}</p>
      <div className="prose-legal mt-6">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet.slice(0, 40)}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <h2>Contact</h2>
        <p>
          Questions about this policy? Email <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> or open a
          support ticket from your dashboard.
        </p>
      </div>
    </div>
  );
}
