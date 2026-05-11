CREATE TABLE IF NOT EXISTS ExhibitionSpecialDecorationReports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  reported INTEGER NOT NULL DEFAULT 0,
  reported_by TEXT NOT NULL DEFAULT '',
  reported_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_special_decoration_reports_project_reported
  ON ExhibitionSpecialDecorationReports(project_id, reported, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_special_decoration_reports_order
  ON ExhibitionSpecialDecorationReports(order_id);