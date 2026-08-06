ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "cloudflare_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "cloudflare_account_id" text;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_cloudflare_api_token" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_vultr_username" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_vultr_password" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_cloudflare_username" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_cloudflare_password" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_openrouter_username" bytea;
ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "encrypted_openrouter_password" bytea;
