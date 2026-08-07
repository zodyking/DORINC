-- Persistent first-party browser/device id for stable known-device tracking.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS sessions_device_id_idx ON sessions USING btree (device_id);
CREATE INDEX IF NOT EXISTS sessions_user_device_idx ON sessions USING btree (user_id, device_id);

-- Start fresh: Known devices were derived from historical sessions keyed by
-- user-agent. Clear all sessions (and pending outside-geo challenges) so devices
-- only reappear after the first-party device_id cookie is established on login.
DELETE FROM sessions;
DELETE FROM outside_geo_challenges;
