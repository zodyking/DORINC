ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "online_access_token" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "online_access_customer_slug" text;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_online_access_token_uq"
  ON "invoices" ("online_access_token")
  WHERE "online_access_token" IS NOT NULL;
