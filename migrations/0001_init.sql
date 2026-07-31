-- Nodebook on D1.
--
-- Conventions:
--   ids         TEXT, from crypto.randomUUID() in the Worker
--   graph data  TEXT, JSON.stringify / JSON.parse at the edge
--   timestamps  TEXT, ISO-8601 UTC, so string sort == time sort
--   access      no row-level security in D1 — every query in worker/ carries
--               `AND user_id = ?`

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  -- "ckdf1$<iterations>$<salt_b64>$<hash_b64>" — a salted hash of the key the
  -- browser derives in src/auth/crypto.js, never of a password. See worker/auth.js.
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Case-insensitive uniqueness: signup/signin always lowercase the address first,
-- but this stops a stray mixed-case row from creating a duplicate account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  -- SHA-256 of the cookie value, never the token itself: a leaked DB read
  -- must not hand out usable sessions.
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,          -- epoch ms
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'New Folder',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS folders_user_idx ON folders(user_id);

CREATE TABLE IF NOT EXISTS graphs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id  TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title      TEXT    NOT NULL DEFAULT 'My Graph',
  data       TEXT    NOT NULL DEFAULT '{"nodes":{},"edges":[],"view":{"tx":0,"ty":0,"scale":1}}',
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS graphs_user_idx    ON graphs(user_id);
CREATE INDEX IF NOT EXISTS graphs_updated_idx ON graphs(user_id, updated_at DESC);
