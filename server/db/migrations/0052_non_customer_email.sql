ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "non_customer_email_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "staff_initiated" boolean DEFAULT false NOT NULL;
