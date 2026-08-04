ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "silent_developer_mode" boolean DEFAULT false NOT NULL;
