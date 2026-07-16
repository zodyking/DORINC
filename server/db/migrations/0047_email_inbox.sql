ALTER TABLE "messages" ALTER COLUMN "sender_user_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "email_threads" (
  "conversation_id" uuid PRIMARY KEY NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "counterpart_email" text NOT NULL,
  "counterpart_name" text,
  "subject" text NOT NULL,
  "root_message_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_threads_customer_idx" ON "email_threads" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "email_threads_counterpart_idx" ON "email_threads" USING btree ("counterpart_email");
CREATE INDEX IF NOT EXISTS "email_threads_updated_idx" ON "email_threads" USING btree ("updated_at");

CREATE TABLE IF NOT EXISTS "email_message_meta" (
  "message_id" uuid PRIMARY KEY NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "direction" text NOT NULL,
  "internet_message_id" text,
  "in_reply_to" text,
  "email_references" text,
  "from_address" text NOT NULL,
  "to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "html_body" text,
  "sent_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_message_meta_internet_message_id_idx" ON "email_message_meta" USING btree ("internet_message_id");
CREATE INDEX IF NOT EXISTS "email_message_meta_direction_idx" ON "email_message_meta" USING btree ("direction");

CREATE TABLE IF NOT EXISTS "email_conversation_reads" (
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "last_read_at" timestamp with time zone,
  CONSTRAINT "email_conversation_reads_unique" UNIQUE("conversation_id","user_id")
);

CREATE INDEX IF NOT EXISTS "email_conversation_reads_user_idx" ON "email_conversation_reads" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "imap_sync_state" (
  "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
  "mailbox" text DEFAULT 'INBOX' NOT NULL,
  "last_uid" bigint,
  "last_sync_at" timestamp with time zone,
  "last_error" text
);
