-- Persistent first-party browser/device id for stable known-device tracking.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS sessions_device_id_idx ON sessions USING btree (device_id);
CREATE INDEX IF NOT EXISTS sessions_user_device_idx ON sessions USING btree (user_id, device_id);
