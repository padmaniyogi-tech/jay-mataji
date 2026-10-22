-- Public demo runs: an isolated table for the no-login "Test Instagram Followers" demo.
-- Rows here carry no user, no payment, no invoice and no provider reference, so a demo
-- can never be confused with a paid production order.

CREATE TABLE IF NOT EXISTS "demo_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "public_id" varchar(24) NOT NULL,
  "target_handle" varchar(30) NOT NULL,
  "target_url" text NOT NULL,
  "requested_quantity" integer NOT NULL,
  "simulated_delivered" integer DEFAULT 0 NOT NULL,
  "duration_seconds" integer DEFAULT 45 NOT NULL,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "ip_hash" varchar(64),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "demo_runs_public_id_key" ON "demo_runs" ("public_id");
CREATE INDEX IF NOT EXISTS "demo_runs_created_idx" ON "demo_runs" ("created_at");
