-- Persistent first-party browser/device id for stable known-device tracking.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS sessions_device_id_idx ON sessions USING btree (device_id);
CREATE INDEX IF NOT EXISTS sessions_user_device_idx ON sessions USING btree (user_id, device_id);

-- Start fresh: Known devices were derived from historical sessions keyed by
-- user-agent. Clear all sessions so devices only reappear after the first-party
-- device_id cookie is established on the next login. Also clear outside-geo
-- challenges when that table exists (created via ensure-schema on boot).
DELETE FROM sessions;

DO $$
BEGIN
  IF to_regclass('public.outside_geo_challenges') IS NOT NULL THEN
    DELETE FROM outside_geo_challenges;
  END IF;
END $$;
