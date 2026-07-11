CREATE TABLE IF NOT EXISTS db_size_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  database_bytes bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS db_size_snapshots_recorded_at_idx
  ON db_size_snapshots (recorded_at DESC);
