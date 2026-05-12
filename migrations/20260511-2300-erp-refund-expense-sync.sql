-- Purpose: Track ERP-synced refund expenses and prevent duplicate refund imports
-- Rollback:
--   DROP INDEX IF EXISTS idx_expenses_erp_record_id;
--   SQLite/D1 cannot drop added columns without rebuilding the table.

ALTER TABLE Expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE Expenses ADD COLUMN erp_record_id TEXT;
ALTER TABLE Expenses ADD COLUMN raw_payload TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_erp_record_id
ON Expenses (erp_record_id);
