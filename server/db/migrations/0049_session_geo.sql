-- Browser geolocation captured on staff sign-in for accurate sign-in alerts.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS geo_latitude double precision,
  ADD COLUMN IF NOT EXISTS geo_longitude double precision,
  ADD COLUMN IF NOT EXISTS geo_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS location_label text;
