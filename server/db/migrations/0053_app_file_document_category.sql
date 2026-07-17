ALTER TABLE "app_files" ADD COLUMN IF NOT EXISTS "document_category" text;
CREATE INDEX IF NOT EXISTS "app_files_document_category_idx"
  ON "app_files" ("owner_entity_type", "owner_entity_id", "document_category")
  WHERE "document_category" IS NOT NULL AND "archived_at" IS NULL;
