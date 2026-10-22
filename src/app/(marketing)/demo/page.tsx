import type { Metadata } from "next";
import { Info } from "lucide-react";
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
        Watch the full campaign workflow — order, progress, result — without an account or a payment. Everything on
        this page is a simulation performed inside Amplifi.
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
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">What this demo does</h2>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-soft">
              <li>Validates your Instagram username or profile URL.</li>
              <li>Creates an isolated demo run — no order, no money, no invoice.</li>
              <li>Shows simulated progress and a clearly labelled simulated result.</li>
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

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-accent-300 bg-accent-50 p-4 text-xs leading-relaxed text-accent-900">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Real delivery:</strong> {realDelivery.message}{" "}
          {realDelivery.available && realDelivery.providers.length > 0 && (
            <span className="font-medium">
              Configured provider{realDelivery.providers.length > 1 ? "s" : ""}:{" "}
              {realDelivery.providers.map((p) => p.name).join(", ")}.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
