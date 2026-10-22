-- Clarify demo status vocabulary so a finished simulation can never read as a delivered
-- campaign. Data is relabelled in place; no rows are deleted and no orders are touched.

ALTER TABLE "demo_runs" ALTER COLUMN "status" SET DEFAULT 'simulating';

UPDATE "demo_runs" SET "status" = 'simulation_complete' WHERE "status" = 'completed';
UPDATE "demo_runs" SET "status" = 'simulating' WHERE "status" = 'running';

-- A demo row can never carry a delivery quantity greater than what was requested.
ALTER TABLE "demo_runs" DROP CONSTRAINT IF EXISTS "demo_runs_quantity_sane";
-- NOT VALID keeps legacy rows from blocking the deploy; new rows are always checked.
ALTER TABLE "demo_runs"
  ADD CONSTRAINT "demo_runs_quantity_sane"
  CHECK ("requested_quantity" BETWEEN 100 AND 5000 AND "simulated_delivered" BETWEEN 0 AND "requested_quantity") NOT VALID;
