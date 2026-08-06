CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "body_html" text DEFAULT '' NOT NULL,
  "hero_image_file_id" uuid,
  "cta_buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "announcements_active_idx" ON "announcements" ("is_active");
CREATE INDEX IF NOT EXISTS "announcements_priority_idx" ON "announcements" ("priority");

CREATE TABLE IF NOT EXISTS "announcement_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE cascade,
  "target_type" text NOT NULL,
  "account_type_key" text,
  "user_id" uuid REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "announcement_targets_announcement_idx" ON "announcement_targets" ("announcement_id");
CREATE INDEX IF NOT EXISTS "announcement_targets_account_type_idx" ON "announcement_targets" ("account_type_key");
CREATE INDEX IF NOT EXISTS "announcement_targets_user_idx" ON "announcement_targets" ("user_id");

CREATE TABLE IF NOT EXISTS "announcement_acknowledgements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_acks_announcement_user_idx"
  ON "announcement_acknowledgements" ("announcement_id", "user_id");
CREATE INDEX IF NOT EXISTS "announcement_acks_user_idx" ON "announcement_acknowledgements" ("user_id");

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_hero_image_file_id_app_files_id_fk"
  FOREIGN KEY ("hero_image_file_id") REFERENCES "app_files"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
