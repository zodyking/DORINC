-- Allow official PDFs generated from the built-in template (no DB template version row).
ALTER TABLE "invoice_files" ALTER COLUMN "template_version_id" DROP NOT NULL;
ALTER TABLE "estimate_files" ALTER COLUMN "template_version_id" DROP NOT NULL;
