import { eq } from "drizzle-orm";
import { db, getDbAsync } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { renderTemplate, sendEmail } from "@/lib/email";
import {
  claimNextJob,
  completeJob,
  failJob,
  releaseStaleJobs,
  type ClaimedJob,
} from "./queue";
import { dispatchOutbox } from "./outbox";
import {
  handleOrderPoll,
  handleOrderRoute,
  handleOrderSubmit,
  handleOrderTimeout,
  handlePaymentExpire,
  handleProviderHealth,
} from "@/lib/orders/processing";
import { processRefund } from "@/lib/orders/refunds";
import type { EmailTemplateKey } from "@/lib/email";

export type WorkerRunResult = { processed: number; failed: number; dispatched: number };

async function handleEmailJob(payload: Record<string, unknown>): Promise<void> {
  const to = String(payload.to ?? "");
  const template = payload.template as EmailTemplateKey;
  if (!to || !template) throw new Error("email.send job is missing recipient or template.");
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const rendered = await renderTemplate(template, { ...data, name: data.name ?? payload.name ?? "there" });
  await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, template });
  if (payload.notificationId) {
    await db
      .update(notifications)
      .set({ emailedAt: new Date() })
      .where(eq(notifications.id, String(payload.notificationId)));
  }
}

async function dispatchJob(job: ClaimedJob): Promise<void> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  switch (job.type) {
    case "order.route":
      return handleOrderRoute({ orderId: String(payload.orderId) });
    case "order.submit":
      return handleOrderSubmit({ orderId: String(payload.orderId), attempt: Number(payload.attempt ?? 0) });
    case "order.poll":
      return handleOrderPoll({ orderId: String(payload.orderId), seq: Number(payload.seq ?? 0) });
    case "order.timeout":
      return handleOrderTimeout({ orderId: String(payload.orderId) });
    case "payment.expire":
      return handlePaymentExpire({ orderId: String(payload.orderId) });
    case "refund.process":
      return processRefund(String(payload.refundId)).then(() => undefined);
    case "email.send":
      return handleEmailJob(payload);
    case "provider.health":
      return handleProviderHealth({ providerId: payload.providerId ? String(payload.providerId) : undefined });
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/**
 * One worker tick: dispatch the outbox, then drain up to `batchSize` due jobs.
 * Safe to run in parallel across processes — claiming uses SKIP LOCKED.
 */
export async function runWorkerOnce(options: { workerId?: string; batchSize?: number } = {}): Promise<WorkerRunResult> {
  await getDbAsync();
  const workerId = options.workerId ?? `worker-${process.pid}`;
  const batchSize = options.batchSize ?? 5;

  await releaseStaleJobs();
  const outboxResult = await dispatchOutbox(20);

  let processed = 0;
  let failed = 0;
  for (let i = 0; i < batchSize; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    try {
      await dispatchJob(job);
      await completeJob(job.id);
      processed += 1;
      logger.debug("job_completed", { jobId: job.id, type: job.type, attempts: job.attempts });
    } catch (err) {
      failed += 1;
      await failJob(job, err);
    }
  }

  return { processed, failed, dispatched: outboxResult.dispatched };
}
