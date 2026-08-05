ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "domain_renewals" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "billing_integrations"
SET "domain_renewals" = COALESCE("namecheap_manual_domains", '[]'::jsonb)
WHERE "domain_renewals" = '[]'::jsonb
  AND "namecheap_manual_domains" IS NOT NULL
  AND "namecheap_manual_domains" <> '[]'::jsonb;

ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_enabled";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_api_user";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_username";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_client_ip";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "encrypted_namecheap_api_key";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_use_sandbox";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_monitored_domains";
ALTER TABLE "billing_integrations" DROP COLUMN IF EXISTS "namecheap_manual_domains";
