-- Relax template_version_id when PDF link tables exist (built-in template has no DB version row).
DO $$ BEGIN
  ALTER TABLE "invoice_files" ALTER COLUMN "template_version_id" DROP NOT NULL;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "estimate_files" ALTER COLUMN "template_version_id" DROP NOT NULL;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;
