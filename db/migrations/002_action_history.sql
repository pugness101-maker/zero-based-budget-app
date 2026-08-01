-- EveryDollarFlow action history (local demo uses Zustand stacks today).
-- Supports durable undo/redo when Postgres is wired in Phase 2.

CREATE TABLE IF NOT EXISTS action_history (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  batch_id TEXT NULL,
  label TEXT NOT NULL,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ NULL,
  redone_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_action_history_household_created
  ON action_history (household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_history_entity
  ON action_history (household_id, entity_type, entity_id);
