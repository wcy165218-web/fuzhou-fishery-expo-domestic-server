-- Purpose: Initialize the production SQLite schema for the Node runtime.
-- Scope: Empty databases only. Use db/drop-sqlite.sql first for local resets.
-- Data import note: import exported D1 rows with explicit column lists.

PRAGMA foreign_keys = OFF;

CREATE TABLE Projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  year INTEGER,
  start_date TEXT,
  end_date TEXT,
  status TEXT
);

CREATE TABLE Staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  target_booths INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  token TEXT,
  target REAL NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  exclude_from_sales_ranking INTEGER NOT NULL DEFAULT 0,
  token_index INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_staff_single_super_admin
  ON Staff ((1))
  WHERE LOWER(TRIM(role)) IN ('super_admin', 'superadmin');

CREATE TABLE Accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  account_name TEXT NOT NULL,
  bank_name TEXT,
  account_no TEXT
);

CREATE TABLE Industries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  industry_name TEXT NOT NULL,
  UNIQUE(project_id, industry_name)
);

CREATE TABLE Prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  booth_type TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  UNIQUE(project_id, booth_type)
);

CREATE TABLE Booths (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  hall TEXT NOT NULL,
  type TEXT NOT NULL,
  area REAL NOT NULL DEFAULT 0,
  price_unit TEXT,
  base_price REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '可售',
  width_m REAL NOT NULL DEFAULT 0,
  height_m REAL NOT NULL DEFAULT 0,
  opening_type TEXT,
  booth_map_id INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  UNIQUE(id, project_id)
);

CREATE TABLE BoothLocks (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  booth_id TEXT NOT NULL,
  lock_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, booth_id)
);

CREATE TABLE Orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  credit_code TEXT,
  no_code_checked INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  main_business TEXT,
  is_agent INTEGER NOT NULL DEFAULT 0,
  agent_name TEXT,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT,
  booth_id TEXT NOT NULL,
  area REAL NOT NULL DEFAULT 0,
  price_unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  total_booth_fee REAL NOT NULL DEFAULT 0,
  discount_reason TEXT,
  other_income REAL NOT NULL DEFAULT 0,
  extra_rentals TEXT,
  fees_json TEXT NOT NULL DEFAULT '[]',
  profile TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  contract_url TEXT,
  booth_display_name TEXT,
  sales_name TEXT NOT NULL,
  fascia_name TEXT,
  fascia_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT '正常',
  reserved_release_due_at TEXT,
  pending_at TEXT,
  pending_source TEXT,
  pending_reason TEXT,
  pending_release_snapshot_json TEXT,
  pending_payment_resolution_status TEXT NOT NULL DEFAULT '',
  pending_payment_handling_method TEXT,
  pending_payment_handling_note TEXT,
  pending_payment_handled_by TEXT,
  pending_payment_handled_at TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  exhibitor_info_status TEXT NOT NULL DEFAULT 'sales_default',
  exhibitor_info_confirmed_by TEXT NOT NULL DEFAULT '',
  exhibitor_info_confirmed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE Payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  order_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  payment_time TEXT NOT NULL,
  payer_name TEXT,
  bank_name TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  source TEXT NOT NULL DEFAULT 'MANUAL',
  erp_record_id TEXT,
  raw_payload TEXT,
  deleted_at TEXT,
  deleted_by TEXT
);

CREATE UNIQUE INDEX idx_payments_erp_record_id
  ON Payments (erp_record_id);

CREATE TABLE LoginAttempts (
  attempt_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at TEXT,
  locked_until TEXT
);

CREATE TABLE WriteRateLimits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE TABLE ProjectErpConfigs (
  project_id INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  endpoint_url TEXT,
  water_id TEXT,
  session_cookie TEXT,
  expected_project_name TEXT,
  use_mock INTEGER NOT NULL DEFAULT 0,
  mock_payload TEXT,
  last_sync_at TEXT,
  last_sync_summary TEXT
);

CREATE TABLE ProjectOrderFieldSettings (
  project_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  required INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  PRIMARY KEY (project_id, field_key)
);

CREATE TABLE ProjectOrderReleaseSettings (
  project_id INTEGER PRIMARY KEY,
  release_after_minutes INTEGER,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE Expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  expense_type TEXT NOT NULL DEFAULT '其他代付',
  payee_name TEXT NOT NULL,
  payee_channel TEXT,
  payee_bank TEXT,
  payee_account TEXT,
  amount REAL NOT NULL DEFAULT 0,
  applicant TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  source TEXT NOT NULL DEFAULT 'MANUAL',
  erp_record_id TEXT,
  raw_payload TEXT,
  deleted_at TEXT,
  deleted_by TEXT
);

CREATE TABLE Agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sales_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  deleted_at TEXT,
  deleted_by TEXT,
  UNIQUE(project_id, name)
);

CREATE TABLE OrderOverpaymentIssues (
  order_id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  overpaid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  note TEXT,
  handled_by TEXT,
  handled_at TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE OrderBoothChanges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  old_booth_id TEXT NOT NULL,
  new_booth_id TEXT NOT NULL,
  old_area REAL NOT NULL DEFAULT 0,
  new_area REAL NOT NULL DEFAULT 0,
  booth_delta_count REAL NOT NULL DEFAULT 0,
  old_total_amount REAL NOT NULL DEFAULT 0,
  new_total_amount REAL NOT NULL DEFAULT 0,
  total_amount_delta REAL NOT NULL DEFAULT 0,
  changed_by TEXT,
  reason TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE BoothMaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  background_image_key TEXT,
  scale_pixels_per_meter REAL NOT NULL DEFAULT 0,
  default_stroke_width REAL NOT NULL DEFAULT 2,
  canvas_width REAL NOT NULL DEFAULT 1600,
  canvas_height REAL NOT NULL DEFAULT 900,
  viewport_x REAL NOT NULL DEFAULT 0,
  viewport_y REAL NOT NULL DEFAULT 0,
  viewport_zoom REAL NOT NULL DEFAULT 1,
  calibration_json TEXT NOT NULL DEFAULT '{}',
  display_config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE BoothMapItems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  map_id INTEGER NOT NULL,
  booth_code TEXT NOT NULL,
  hall TEXT NOT NULL,
  booth_type TEXT NOT NULL,
  opening_type TEXT,
  width_m REAL NOT NULL DEFAULT 0,
  height_m REAL NOT NULL DEFAULT 0,
  area REAL NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  rotation REAL NOT NULL DEFAULT 0,
  stroke_width REAL NOT NULL DEFAULT 2,
  shape_type TEXT NOT NULL DEFAULT 'rect',
  points_json TEXT NOT NULL DEFAULT '[]',
  label_style_json TEXT NOT NULL DEFAULT '{}',
  z_index INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, booth_code)
);

CREATE TABLE ExhibitionRefrigeratorConfigs (
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

CREATE TABLE ExhibitionRefrigeratorRentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  sales_name TEXT NOT NULL,
  hall_names TEXT NOT NULL DEFAULT '',
  booth_numbers TEXT NOT NULL DEFAULT '',
  organizer_payment_total REAL NOT NULL DEFAULT 0,
  venue_payment_total REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  rental_mode TEXT NOT NULL DEFAULT 'booth',
  usage_location TEXT NOT NULL DEFAULT '',
  venue_confirmed INTEGER NOT NULL DEFAULT 0,
  venue_confirmed_by TEXT NOT NULL DEFAULT '',
  venue_confirmed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, company_name)
);

CREATE TABLE ExhibitionRefrigeratorRentalItems (
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

CREATE TABLE ExhibitionLintels (
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
  business_confirm_source TEXT NOT NULL DEFAULT 'sales',
  exhibition_confirmed INTEGER NOT NULL DEFAULT 0,
  exhibition_confirmed_by TEXT NOT NULL DEFAULT '',
  exhibition_confirmed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(project_id, order_id, booth_code)
);

CREATE TABLE ExhibitionSpecialDecorationReports (
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

CREATE TABLE ExhibitionConfirmationSettings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE,
  title_text TEXT NOT NULL DEFAULT '请核对并确认参展信息',
  banner_image_key TEXT NOT NULL DEFAULT '',
  link_ttl_minutes INTEGER NOT NULL DEFAULT 30,
  collection_deadline_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE ExhibitorConfirmationLinks (
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

CREATE TABLE ExhibitorConfirmationEvents (
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

CREATE INDEX idx_orders_project_status_created_at
  ON Orders (project_id, status, created_at DESC);

CREATE INDEX idx_orders_project_booth_status_created_at
  ON Orders (project_id, booth_id, status, created_at ASC);

CREATE INDEX idx_orders_project_sales_created_at
  ON Orders (project_id, sales_name, created_at DESC);

CREATE INDEX idx_orders_project_status_release_due
  ON Orders (project_id, status, reserved_release_due_at);

CREATE INDEX idx_orders_project_pending_at
  ON Orders (project_id, status, pending_at DESC);

CREATE INDEX idx_payments_order_deleted_time
  ON Payments (order_id, deleted_at, payment_time DESC);

CREATE INDEX idx_payments_project_deleted_order
  ON Payments (project_id, deleted_at, order_id);

CREATE INDEX idx_expenses_order_deleted_created_at
  ON Expenses (order_id, deleted_at, created_at DESC);

CREATE INDEX idx_expenses_project_deleted_order
  ON Expenses (project_id, deleted_at, order_id);

CREATE INDEX idx_expenses_project_type_deleted
  ON Expenses (project_id, expense_type, deleted_at);

CREATE UNIQUE INDEX idx_expenses_erp_record_id
  ON Expenses (erp_record_id);

CREATE INDEX idx_booths_project_hall_id
  ON Booths (project_id, hall, id);

CREATE INDEX idx_booth_locks_project_expires_at
  ON BoothLocks (project_id, expires_at);

CREATE INDEX idx_booths_project_booth_map_id
  ON Booths (project_id, booth_map_id, id);

CREATE INDEX idx_booth_maps_project_updated_at
  ON BoothMaps (project_id, updated_at DESC);

CREATE INDEX idx_booth_map_items_project_map_z_index
  ON BoothMapItems (project_id, map_id, z_index, id);

CREATE INDEX idx_booth_map_items_project_map_booth_code
  ON BoothMapItems (project_id, map_id, booth_code);

CREATE INDEX idx_agents_project_deleted_sales
  ON Agents (project_id, deleted_at, sales_name);

CREATE INDEX idx_order_booth_changes_project_order_changed_at
  ON OrderBoothChanges (project_id, order_id, changed_at DESC);

CREATE INDEX idx_order_overpayment_issues_project_status
  ON OrderOverpaymentIssues (project_id, status);

CREATE INDEX idx_exhibition_refrigerator_configs_project_active
  ON ExhibitionRefrigeratorConfigs (project_id, is_active, display_order, id);

CREATE INDEX idx_exhibition_refrigerator_rentals_project_sales_updated
  ON ExhibitionRefrigeratorRentals (project_id, sales_name, updated_at DESC, id DESC);

CREATE INDEX idx_exhibition_refrigerator_items_rental
  ON ExhibitionRefrigeratorRentalItems (rental_id, config_id);

CREATE INDEX idx_exhibition_lintels_project_order
  ON ExhibitionLintels (project_id, order_id, booth_code);

CREATE INDEX idx_exhibition_lintels_project_status
  ON ExhibitionLintels (project_id, business_confirmed, exhibition_confirmed, updated_at DESC, id DESC);

CREATE INDEX idx_special_decoration_reports_project_reported
  ON ExhibitionSpecialDecorationReports (project_id, reported, updated_at DESC);

CREATE INDEX idx_special_decoration_reports_order
  ON ExhibitionSpecialDecorationReports (order_id);

CREATE INDEX idx_exhibitor_confirmation_links_order
  ON ExhibitorConfirmationLinks (project_id, order_id, revoked_at, submitted_at, expires_at);

CREATE INDEX idx_exhibitor_confirmation_links_token
  ON ExhibitorConfirmationLinks (token_hash);

CREATE INDEX idx_exhibitor_confirmation_events_order
  ON ExhibitorConfirmationEvents (project_id, order_id, created_at DESC, id DESC);

PRAGMA foreign_keys = ON;
