CREATE TABLE IF NOT EXISTS tern_companion_pairing (
  code text PRIMARY KEY,
  user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS tern_companions (
  user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE,
  id text NOT NULL,
  token_hash text NOT NULL,
  label text NOT NULL,
  platform text NOT NULL,
  detected_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_heartbeat bigint,
  PRIMARY KEY(user_id, id)
);

CREATE TABLE IF NOT EXISTS tern_relay_jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE,
  companion_id text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tern_companion_pairing_expires ON tern_companion_pairing(expires_at);
CREATE INDEX IF NOT EXISTS tern_relay_jobs_companion_pending ON tern_relay_jobs(companion_id, status);
