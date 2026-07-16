ALTER TABLE "service_logs" ADD COLUMN IF NOT EXISTS "customer_requested" boolean DEFAULT false NOT NULL;

-- Existing rows stay on their current status; new logs default to draft via schema.
