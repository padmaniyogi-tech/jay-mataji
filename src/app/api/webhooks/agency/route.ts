import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { NO_STORE_HEADERS } from "@/lib/http";
import { captureException, logger } from "@/lib/logger";
import { createAdapter } from "@/lib/providers/registry";
import { finishWebhook, recordWebhook, enqueueReconciliationForProviderRef } from "@/lib/payments/webhook";

export const dynamic = "force-dynamic";

/**
 * Approved-agency webhook. The partner signs the raw body with HMAC-SHA256 (X-Signature).
 * We record the event idempotently and schedule reconciliation rather than trusting the
 * payload's claimed status directly.
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

    const providerRows = await db
      .select()
      .from(providers)
      .where(eq(providers.kind, "agency"))
      .orderBy(providers.priority)
      .limit(1);
    const provider = providerRows[0];
    if (!provider) {
      return Response.json({ error: "No agency provider configured" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const adapter = createAdapter(provider);
    const result = await adapter.handleWebhook({ headers: req.headers, rawBody, parsed });
    if (!result.signatureValid) {
      await recordWebhook({ source: "agency", externalId: `invalid_${Date.now()}`, payload: parsed, signatureValid: false });
      return Response.json({ error: result.message ?? "Invalid signature" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { id, duplicate } = await recordWebhook({
      source: "agency",
      externalId: result.externalId,
      payload: parsed,
      signatureValid: true,
    });
    if (duplicate) {
      return Response.json({ received: true, duplicate: true }, { status: 200, headers: NO_STORE_HEADERS });
    }

    const refs = [String(parsed.campaignId ?? ""), String(parsed.id ?? "")].filter(Boolean);
    const scheduled = await enqueueReconciliationForProviderRef(refs, "agency_webhook");
    await finishWebhook(id, scheduled > 0 ? "processed" : "ignored", scheduled > 0 ? undefined : "No matching order");
    logger.info("agency_webhook_processed", { eventId: result.externalId, scheduled });
    return Response.json({ received: true, reconciled: scheduled }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    captureException(err, { source: "agency_webhook" });
    return Response.json({ error: "Webhook handler error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
