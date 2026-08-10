ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "message_notify_channel" text DEFAULT 'email' NOT NULL;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_message_notify_channel_check"
    CHECK ("message_notify_channel" IN ('email', 'sms'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sms_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "content" jsonb NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sms_templates_active_idx" ON "sms_templates" USING btree ("is_active");

DO $$ BEGIN
  ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
