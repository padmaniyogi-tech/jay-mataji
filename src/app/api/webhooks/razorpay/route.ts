import { jsonError, NO_STORE_HEADERS } from "@/lib/http";
import { processRazorpayWebhook } from "@/lib/payments/webhook";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { captureException } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook endpoint.
 * Signature verification happens against the RAW body; duplicates are de-duplicated by
 * X-Razorpay-Event-Id before any state change.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await ensureDatabaseReady();
    const result = await processRazorpayWebhook(req);
    return Response.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
  } catch (err) {
    captureException(err, { source: "razorpay_webhook" });
    return jsonError("Webhook handler error.", { status: 500, code: "webhook_error" });
  }
}
