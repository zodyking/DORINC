ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(8, 4);
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(8, 4);

ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(8, 4);

ALTER TABLE "estimate_line_items" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "estimate_line_items" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(8, 4);
