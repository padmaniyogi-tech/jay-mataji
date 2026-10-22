import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, ShieldX } from "lucide-react";
import { Badge, Card, CardBody } from "@/components/ui/primitives";
import { DemoRunner } from "@/components/demo/demo-runner";
import { DEMO_LIMITS, getRealDeliveryStatus } from "@/lib/demo/service";

export const metadata: Metadata = {
  title: "Test Instagram Followers — demo",
  description:
    "A no-login, no-payment demo of the Amplifi campaign workflow. Simulated only: no real Instagram followers are delivered.",
};

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const realDelivery = await getRealDeliveryStatus();

  return (
    <div className="container-page max-w-3xl py-10">
      <Badge tone="demo">Demo mode</Badge>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Test Instagram Followers</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft">
        Watch the campaign workflow — order, progress, result — without an account or a payment. Everything on this page
        is a simulation performed inside Amplifi. It does not change your Instagram account.
      </p>

      <div className="mt-8">
        <DemoRunner
          limits={{
            min: DEMO_LIMITS.min,
            max: DEMO_LIMITS.max,
            step: DEMO_LIMITS.step,
            durationSeconds: DEMO_LIMITS.durationSeconds,
          }}
          realDeliveryAvailable={realDelivery.available}
          realDeliveryMessage={realDelivery.message}
          realDeliveryAlternative={realDelivery.alternative}
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">What this demo does</h2>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-soft">
              <li>Validates your Instagram username or profile URL.</li>
              <li>Creates an isolated demo run — no order, no money, no invoice.</li>
              <li>Animates simulated progress and shows a clearly labelled simulated summary.</li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">What it does not do</h2>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-soft">
              <li>It does not add followers, likes or views to any account.</li>
              <li>It does not use bots, fake accounts or automated follows.</li>
              <li>It never asks for your Instagram password, cookies or tokens.</li>
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Real-delivery truth, rendered server-side so it cannot be missed or reworded by JS. */}
      <Card className="mt-6 border-accent-300 bg-accent-50">
        <CardBody className="space-y-3">
          <div className="flex items-start gap-3">
            <ShieldX aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-800" />
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-accent-900">Real delivery</h2>
              <p className="text-xs leading-relaxed text-accent-900">{realDelivery.message}</p>

              {realDelivery.candidates.length > 0 && (
                <div className="rounded-lg border border-accent-300 bg-white/60 p-3">
                  <p className="text-xs font-semibold text-accent-900">Provider status (checked now)</p>
                  <ul className="mt-1.5 space-y-1">
                    {realDelivery.candidates.map((candidate) => (
                      <li key={candidate.key} className="text-xs leading-relaxed text-accent-900">
                        <span className="font-medium">{candidate.name}</span>{" "}
                        <span className="font-mono text-[11px]">({candidate.kind})</span> —{" "}
                        {candidate.enabled ? "enabled" : "disabled"}, {candidate.health} ·{" "}
                        <span className="font-medium">{candidate.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-accent-300 bg-white/60 p-3">
                <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-800" />
                <p className="text-xs leading-relaxed text-accent-900">{realDelivery.alternative}</p>
              </div>

              <Link
                href="/services/instagram-advertising-campaign"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent-900 underline decoration-dotted underline-offset-2"
              >
                See the advertising campaign service <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
