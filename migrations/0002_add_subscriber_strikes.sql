-- Migration: add a strikes counter to subscribers so the bulk-email sender
-- can disable addresses that repeatedly fail to deliver.
--
-- SQLite ALTER TABLE ADD COLUMN is safe + fast; the column gets the default
-- on read for existing rows.

ALTER TABLE subscribers ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;
