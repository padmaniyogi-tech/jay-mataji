import type { Executor } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  /** Free-text actor label (e.g. "payment-webhook") stored inside metadata. */
  actorLabel?: string | null;
};

/**
 * Append-only audit trail. Never pass secrets, tokens or card data in metadata —
 * `redact` in the logger is a safety net, not a licence to log sensitive values.
 */
export async function recordAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  try {
    await executor.insert(auditLogs).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      actorRole: entry.actorRole ?? null,
      metadata: { ...(entry.metadata ?? {}), ...(entry.actorLabel ? { actorLabel: entry.actorLabel } : {}) },
      ip: entry.ip ?? null,
    });
  } catch (err) {
    logger.error("audit_write_failed", { action: entry.action, message: (err as Error).message });
  }
}
