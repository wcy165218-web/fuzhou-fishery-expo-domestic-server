-- Purpose: Add pending-order recycle flow and reserved-order auto-release settings
-- Scope: Production and preview D1 databases
-- Rollback: Keep audit columns; set release_after_minutes to NULL to disable auto-release

ALTER TABLE Orders ADD COLUMN reserved_release_due_at TEXT;
ALTER TABLE Orders ADD COLUMN pending_at TEXT;
ALTER TABLE Orders ADD COLUMN pending_source TEXT;
ALTER TABLE Orders ADD COLUMN pending_reason TEXT;
ALTER TABLE Orders ADD COLUMN pending_release_snapshot_json TEXT;
ALTER TABLE Orders ADD COLUMN pending_payment_resolution_status TEXT NOT NULL DEFAULT '';
ALTER TABLE Orders ADD COLUMN pending_payment_handling_method TEXT;
ALTER TABLE Orders ADD COLUMN pending_payment_handling_note TEXT;
ALTER TABLE Orders ADD COLUMN pending_payment_handled_by TEXT;
ALTER TABLE Orders ADD COLUMN pending_payment_handled_at TEXT;
ALTER TABLE Orders ADD COLUMN deleted_at TEXT;
ALTER TABLE Orders ADD COLUMN deleted_by TEXT;

CREATE TABLE IF NOT EXISTS ProjectOrderReleaseSettings (
  project_id INTEGER PRIMARY KEY,
  release_after_minutes INTEGER,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_orders_project_status_release_due
  ON Orders (project_id, status, reserved_release_due_at);

CREATE INDEX IF NOT EXISTS idx_orders_project_pending_at
  ON Orders (project_id, status, pending_at DESC);
