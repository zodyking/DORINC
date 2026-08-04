ALTER TABLE "billing_integrations" ADD COLUMN IF NOT EXISTS "namecheap_manual_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;
