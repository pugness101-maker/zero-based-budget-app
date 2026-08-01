-- EveryDollarFlow Phase 2 schema note (local demo uses Zustand today).
-- Migration: account hide / close / soft-delete fields.
-- Preserve existing rows; defaults keep current accounts active and visible.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS imported_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Keep legacy `closed` boolean in sync for older readers
UPDATE accounts
SET closed = TRUE
WHERE closed_at IS NOT NULL AND closed IS DISTINCT FROM TRUE;

UPDATE accounts
SET closed = FALSE
WHERE closed_at IS NULL AND closed IS DISTINCT FROM FALSE;

CREATE INDEX IF NOT EXISTS idx_accounts_hidden
  ON accounts (household_id, is_hidden)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_closed
  ON accounts (household_id, closed_at)
  WHERE deleted_at IS NULL;
