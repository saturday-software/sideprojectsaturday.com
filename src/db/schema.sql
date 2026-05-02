CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_participant INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);

-- Partial index: only pending rows hold a token, so this stays tiny while
-- making the verification UPDATE an index lookup instead of a full scan.
CREATE INDEX IF NOT EXISTS idx_subscribers_verification_token
  ON subscribers(verification_token)
  WHERE verification_token IS NOT NULL;

-- Speeds up status-filtered reads: getVerifiedSubscribers (cron) and
-- cleanupExpiredPending (cron, on 'pending' rows).
CREATE INDEX IF NOT EXISTS idx_subscribers_status
  ON subscribers(status);

-- Partial index for getParticipants: only verified participants are indexed,
-- so it stays small and serves the cron query directly.
CREATE INDEX IF NOT EXISTS idx_subscribers_participants
  ON subscribers(email)
  WHERE status = 'verified' AND is_participant = 1;

CREATE TABLE IF NOT EXISTS events (
  date INTEGER PRIMARY KEY NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS door_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day INTEGER NOT NULL,            -- 0=Sun, 1=Mon, ..., 6=Sat
  start_hour INTEGER NOT NULL,     -- 0-23
  start_minute INTEGER NOT NULL DEFAULT 0,  -- 0-59
  end_hour INTEGER NOT NULL,       -- 0-23
  end_minute INTEGER NOT NULL DEFAULT 0,    -- 0-59
  enabled INTEGER NOT NULL DEFAULT 1,
  event_only INTEGER NOT NULL DEFAULT 0  -- 1 = only active when event is not cancelled
);
