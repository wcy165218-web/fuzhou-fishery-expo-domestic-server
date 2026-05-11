-- Purpose: add exhibitor confirmation share links, settings, and order-level audit events
-- Scope: external exhibitor confirmation page, exhibitor directory status, lintel confirmation source
-- Rollback: recreate affected tables/columns from backup if this feature must be fully removed

ALTER TABLE Orders ADD COLUMN exhibitor_info_status TEXT NOT NULL DEFAULT 'sales_default';
ALTER TABLE Orders ADD COLUMN exhibitor_info_confirmed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE Orders ADD COLUMN exhibitor_info_confirmed_at TEXT NOT NULL DEFAULT '';

ALTER TABLE ExhibitionLintels ADD COLUMN business_confirm_source TEXT NOT NULL DEFAULT 'sales';

CREATE TABLE IF NOT EXISTS ExhibitionConfirmationSettings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE,
  title_text TEXT NOT NULL DEFAULT '请核对并确认参展信息',
  banner_image_key TEXT NOT NULL DEFAULT '',
  link_ttl_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS ExhibitorConfirmationLinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_secret TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS ExhibitorConfirmationEvents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  link_id INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  before_snapshot_json TEXT NOT NULL DEFAULT '{}',
  after_snapshot_json TEXT NOT NULL DEFAULT '{}',
  diff_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_exhibitor_confirmation_links_order
  ON ExhibitorConfirmationLinks (project_id, order_id, revoked_at, submitted_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_exhibitor_confirmation_links_token
  ON ExhibitorConfirmationLinks (token_hash);

CREATE INDEX IF NOT EXISTS idx_exhibitor_confirmation_events_order
  ON ExhibitorConfirmationEvents (project_id, order_id, created_at DESC, id DESC);
