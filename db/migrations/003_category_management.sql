-- EveryDollarFlow category / category-group management fields.
-- Local demo uses Zustand; this migration is for future Postgres.

ALTER TABLE category_groups
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS merged_into_group_id TEXT NULL;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS merged_into_category_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS report_included BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS color TEXT NULL,
  ADD COLUMN IF NOT EXISTS icon TEXT NULL;

-- `hidden` and `sort_order` already exist on both tables in the product model.

CREATE INDEX IF NOT EXISTS idx_categories_group_sort
  ON categories (household_id, group_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_hidden
  ON categories (household_id, hidden, is_archived)
  WHERE deleted_at IS NULL;
