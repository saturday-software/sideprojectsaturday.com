-- Migration: add indexes to the subscribers table to eliminate full table
-- scans on the hottest queries (verification UPDATE and status-filtered reads).
--
-- Idempotent (IF NOT EXISTS) so it's a no-op against environments where
-- src/db/schema.sql was already applied with these indexes.

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
