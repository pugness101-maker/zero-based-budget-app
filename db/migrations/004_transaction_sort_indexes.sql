-- Suggested indexes for server-side / shared data-layer transaction sorting.
-- Demo app currently sorts in memory; apply when Postgres is wired.

-- CREATE INDEX IF NOT EXISTS idx_transactions_date
--   ON transactions (date DESC, created_at DESC, id DESC);

-- CREATE INDEX IF NOT EXISTS idx_transactions_account_date
--   ON transactions (account_id, date DESC, id DESC);

-- CREATE INDEX IF NOT EXISTS idx_transactions_payee
--   ON transactions (payee_id);

-- CREATE INDEX IF NOT EXISTS idx_transactions_category
--   ON transactions (category_id);

-- CREATE INDEX IF NOT EXISTS idx_transactions_amount
--   ON transactions (amount_cents);

-- CREATE INDEX IF NOT EXISTS idx_transactions_cleared
--   ON transactions (cleared_status);

-- CREATE INDEX IF NOT EXISTS idx_transactions_created
--   ON transactions (created_at DESC);

-- CREATE INDEX IF NOT EXISTS idx_transactions_updated
--   ON transactions (updated_at DESC);

SELECT 1;
