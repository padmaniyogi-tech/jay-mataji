-- Extend order event kinds so the audit trail can record financial and staff events.
ALTER TYPE "campaign_event_kind" ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE "campaign_event_kind" ADD VALUE IF NOT EXISTS 'payment';
ALTER TYPE "campaign_event_kind" ADD VALUE IF NOT EXISTS 'refund';
ALTER TYPE "campaign_event_kind" ADD VALUE IF NOT EXISTS 'note';
ALTER TYPE "campaign_event_kind" ADD VALUE IF NOT EXISTS 'status_change';
