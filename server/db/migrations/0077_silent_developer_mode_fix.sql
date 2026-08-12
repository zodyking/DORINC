-- 0058_silent_developer_mode was never registered in meta/_journal.json, so the
-- column was missing on any database built from migrations. Every insert and
-- select against "users" then failed, which broke sign-in and account creation.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "silent_developer_mode" boolean DEFAULT false NOT NULL;
