CREATE TABLE IF NOT EXISTS "email_ingest_suppressions" (
  "internet_message_id" text PRIMARY KEY NOT NULL,
  "source_conversation_id" uuid,
  "counterpart_email" text,
  "subject" text,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_ingest_suppressions_conversation_idx"
  ON "email_ingest_suppressions" USING btree ("source_conversation_id");
CREATE INDEX IF NOT EXISTS "email_ingest_suppressions_deleted_at_idx"
  ON "email_ingest_suppressions" USING btree ("deleted_at");
