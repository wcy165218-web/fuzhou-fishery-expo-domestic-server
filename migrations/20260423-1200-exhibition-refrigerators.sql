-- Purpose: add exhibition refrigerator configuration and rental tables
-- Scope: production D1 schema for exhibition management refrigerator module
-- Rollback: drop the three ExhibitionRefrigerator* tables and their indexes if the module must be fully removed

CREATE TABLE IF NOT EXISTS ExhibitionRefrigeratorConfigs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  style_name TEXT NOT NULL,
  spec TEXT NOT NULL,
  image_key TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, style_name)
);

CREATE TABLE IF NOT EXISTS ExhibitionRefrigeratorRentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  sales_name TEXT NOT NULL,
  hall_names TEXT NOT NULL DEFAULT '',
  booth_numbers TEXT NOT NULL DEFAULT '',
  organizer_payment_total REAL NOT NULL DEFAULT 0,
  venue_payment_total REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, company_name)
);

CREATE TABLE IF NOT EXISTS ExhibitionRefrigeratorRentalItems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rental_id INTEGER NOT NULL,
  config_id INTEGER NOT NULL,
  style_name_snapshot TEXT NOT NULL,
  spec_snapshot TEXT NOT NULL,
  image_key_snapshot TEXT,
  unit_price_snapshot REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  line_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_exhibition_refrigerator_configs_project_active
  ON ExhibitionRefrigeratorConfigs (project_id, is_active, display_order, id);

CREATE INDEX IF NOT EXISTS idx_exhibition_refrigerator_rentals_project_sales_updated
  ON ExhibitionRefrigeratorRentals (project_id, sales_name, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_exhibition_refrigerator_items_rental
  ON ExhibitionRefrigeratorRentalItems (rental_id, config_id);