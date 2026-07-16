// Idempotent repair for IMAP/email thread tables when Drizzle migrate did not apply 0047.
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const INLINE_0047_SQL = `
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
`.trim()

const INLINE_0048_SQL = `
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
`.trim()

async function resolveMigrationsFolder() {
  const candidates = [
    join(process.cwd(), 'server/db/migrations'),
    join(process.cwd(), '.output/server/db/migrations'),
    join(process.cwd(), '.data/db-migrations'),
  ]

  for (const folder of candidates) {
    try {
      await access(join(folder, '0047_email_inbox.sql'))
      return folder
    }
    catch {
      // try next
    }
  }

  return null
}

/**
 * Apply email inbox and deletion-suppression schemas when either is missing.
 * Safe to run after Drizzle migrate on every boot or before IMAP operations.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when repair SQL was applied
 */
export async function ensureEmailInboxSchema(pool) {
  let applied = false
  const folder = await resolveMigrationsFolder()
  const { rows: inboxRows } = await pool.query(`SELECT to_regclass('public.email_threads') AS reg`)
  if (!inboxRows[0]?.reg) {
    const sql = folder
      ? await readFile(join(folder, '0047_email_inbox.sql'), 'utf8')
      : INLINE_0047_SQL
    await pool.query(sql)
    console.log('[migrate] ensured email inbox tables (0047_email_inbox)')
    applied = true
  }

  const { rows: suppressionRows } = await pool.query(
    `SELECT to_regclass('public.email_ingest_suppressions') AS reg`,
  )
  if (!suppressionRows[0]?.reg) {
    const sql = folder
      ? await readFile(join(folder, '0048_email_ingest_suppressions.sql'), 'utf8')
      : INLINE_0048_SQL
    await pool.query(sql)
    console.log('[migrate] ensured deleted email suppression table (0048_email_ingest_suppressions)')
    applied = true
  }

  return applied
}
