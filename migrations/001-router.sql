CREATE TABLE IF NOT EXISTS tern_users (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tern_sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS tern_connections (
 user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE, id text NOT NULL,
 metadata jsonb NOT NULL, secret text NOT NULL, last_used bigint, test_after bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS tern_pools (
 user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE, id text NOT NULL, config jsonb NOT NULL, PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS tern_cursors (
 user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE, scope text NOT NULL, cursor bigint NOT NULL DEFAULT 0, PRIMARY KEY(user_id,scope)
);
CREATE TABLE IF NOT EXISTS tern_limits (
 scope text PRIMARY KEY, bucket bigint NOT NULL, count integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tern_traces (
 user_id text NOT NULL REFERENCES tern_users(id) ON DELETE CASCADE, id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), trace jsonb NOT NULL, PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS tern_traces_owner_time ON tern_traces(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tern_sessions_expiry ON tern_sessions(expires_at);
