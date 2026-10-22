import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { getEnv } from "@/lib/env";
import { safeEqual } from "@/lib/ids";
import { NO_STORE_HEADERS } from "@/lib/http";
import { captureException } from "@/lib/logger";
import { createAdapter } from "@/lib/providers/registry";
import { enqueueReconciliationForProviderRef, finishWebhook, recordWebhook } from "@/lib/payments/webhook";

export const dynamic = "force-dynamic";

/** Meta webhook subscription handshake. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = getEnv().META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token && safeEqual(token, expected)) {
    return new Response(challenge ?? "", { status: 200, headers: { ...NO_STORE_HEADERS, "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Meta webhook receiver. X-Hub-Signature-256 is verified by the adapter against the raw
 * body. Campaign ids are mapped back to orders and reconciled through the normal poll path.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await ensureDatabaseReady();
    const rawBody = await req.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Malformed JSON" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const providerRows = await db.select().from(providers).where(eq(providers.kind, "meta_ads")).limit(1);
    const provider = providerRows[0];
    if (!provider) {
      return Response.json({ error: "No Meta provider configured" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const adapter = createAdapter(provider);
    const result = await adapter.handleWebhook({ headers: req.headers, rawBody, parsed });
    if (!result.signatureValid) {
      await recordWebhook({ source: "meta", externalId: `invalid_${Date.now()}`, payload: parsed, signatureValid: false });
      return Response.json({ error: result.message ?? "Invalid signature" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { id, duplicate } = await recordWebhook({
      source: "meta",
      externalId: result.externalId,
      payload: parsed,
      signatureValid: true,
    });
    if (duplicate) {
      return Response.json({ received: true, duplicate: true }, { status: 200, headers: NO_STORE_HEADERS });
    }

    const entries = (parsed.entry as Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> | undefined) ?? [];
    const refs: string[] = [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const campaignId = change.value?.campaign_id;
        if (typeof campaignId === "string") refs.push(campaignId);
      }
    }
    const scheduled = await enqueueReconciliationForProviderRef(refs, "meta_webhook");
    await finishWebhook(id, scheduled > 0 ? "processed" : "ignored", scheduled > 0 ? undefined : "No matching order");
    return Response.json({ received: true, reconciled: scheduled }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    captureException(err, { source: "meta_webhook" });
    return Response.json({ error: "Webhook handler error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
