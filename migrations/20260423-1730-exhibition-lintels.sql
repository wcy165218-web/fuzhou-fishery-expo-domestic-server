-- Purpose: add lintel management records for exhibition signboard workflows
-- Scope: store editable lintel names, remarks, business confirmation and exhibition confirmation states by order booth
-- Rollback: drop ExhibitionLintels and its indexes if the lintel module must be fully removed

CREATE TABLE IF NOT EXISTS ExhibitionLintels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  booth_code TEXT NOT NULL,
  name_zh TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  business_confirmed INTEGER NOT NULL DEFAULT 0,
  business_confirmed_by TEXT NOT NULL DEFAULT '',
  business_confirmed_at TEXT NOT NULL DEFAULT '',
  exhibition_confirmed INTEGER NOT NULL DEFAULT 0,
  exhibition_confirmed_by TEXT NOT NULL DEFAULT '',
  exhibition_confirmed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, order_id, booth_code)
);

CREATE INDEX IF NOT EXISTS idx_exhibition_lintels_project_order
  ON ExhibitionLintels (project_id, order_id, booth_code);

CREATE INDEX IF NOT EXISTS idx_exhibition_lintels_project_status
  ON ExhibitionLintels (project_id, business_confirmed, exhibition_confirmed, updated_at DESC, id DESC);