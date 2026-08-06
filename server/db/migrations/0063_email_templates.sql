CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type_key" text NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "content" jsonb NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_type_key_unique" ON "email_templates" ("type_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_active_idx" ON "email_templates" ("is_active");
