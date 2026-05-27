import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createD1SqliteDatabase } from '../src/adapter/db.mjs';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const initSql = fs.readFileSync(path.join(repoRoot, 'db/init-sqlite.sql'), 'utf8');
const dropSql = fs.readFileSync(path.join(repoRoot, 'db/drop-sqlite.sql'), 'utf8');
const localBootstrapSql = fs.readFileSync(path.join(repoRoot, 'db/local/20260320-1200-local-test-bootstrap.sql'), 'utf8');

function createTempDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-sqlite-schema-'));
  const filename = path.join(dir, 'schema.sqlite');
  const db = createD1SqliteDatabase(filename);
  return {
    db,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function listTableNames(db) {
  return db.database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function listIndexNames(db) {
  return db.database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function listColumnNames(db, tableName) {
  return db.database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

const expectedTables = [
  'Accounts',
  'Agents',
  'BoothLocks',
  'BoothMapItems',
  'BoothMaps',
  'Booths',
  'ExhibitionConfirmationSettings',
  'ExhibitionLintels',
  'ExhibitionRefrigeratorConfigs',
  'ExhibitionRefrigeratorRentalItems',
  'ExhibitionRefrigeratorRentals',
  'ExhibitionSpecialDecorationReports',
  'ExhibitorConfirmationEvents',
  'ExhibitorConfirmationLinks',
  'Expenses',
  'Industries',
  'LoginAttempts',
  'OrderBoothChanges',
  'OrderOverpaymentIssues',
  'Orders',
  'Payments',
  'Prices',
  'ProjectErpConfigs',
  'ProjectOrderFieldSettings',
  'ProjectOrderReleaseSettings',
  'Projects',
  'Staff',
  'WriteRateLimits'
].sort();

const expectedIndexes = [
  'idx_agents_project_deleted_sales',
  'idx_booth_locks_project_expires_at',
  'idx_booth_map_items_project_map_booth_code',
  'idx_booth_map_items_project_map_z_index',
  'idx_booth_maps_project_updated_at',
  'idx_booths_project_booth_map_id',
  'idx_booths_project_hall_id',
  'idx_exhibition_lintels_project_order',
  'idx_exhibition_lintels_project_status',
  'idx_exhibition_refrigerator_configs_project_active',
  'idx_exhibition_refrigerator_items_rental',
  'idx_exhibition_refrigerator_rentals_project_sales_updated',
  'idx_exhibitor_confirmation_events_order',
  'idx_exhibitor_confirmation_links_order',
  'idx_exhibitor_confirmation_links_token',
  'idx_expenses_erp_record_id',
  'idx_expenses_order_deleted_created_at',
  'idx_expenses_project_deleted_order',
  'idx_expenses_project_type_deleted',
  'idx_order_booth_changes_project_order_changed_at',
  'idx_order_overpayment_issues_project_status',
  'idx_orders_project_booth_status_created_at',
  'idx_orders_project_pending_at',
  'idx_orders_project_sales_created_at',
  'idx_orders_project_status_created_at',
  'idx_orders_project_status_release_due',
  'idx_payments_erp_record_id',
  'idx_payments_order_deleted_time',
  'idx_payments_project_deleted_order',
  'idx_special_decoration_reports_order',
  'idx_special_decoration_reports_project_reported',
  'idx_staff_single_super_admin'
].sort();

{
  const { db, cleanup } = createTempDatabase();
  try {
    db.database.exec(initSql);

    assert.deepEqual(listTableNames(db), expectedTables);
    assert.deepEqual(listIndexNames(db), expectedIndexes);

    assert.deepEqual(
      listColumnNames(db, 'ExhibitionRefrigeratorRentals').filter((name) => (
        ['rental_mode', 'usage_location', 'venue_confirmed', 'venue_confirmed_by', 'venue_confirmed_at'].includes(name)
      )),
      ['rental_mode', 'usage_location', 'venue_confirmed', 'venue_confirmed_by', 'venue_confirmed_at']
    );
    assert.ok(listColumnNames(db, 'ExhibitionLintels').includes('business_confirm_source'));
    const confirmationSettingsColumns = listColumnNames(db, 'ExhibitionConfirmationSettings');
    assert.ok(confirmationSettingsColumns.includes('collection_deadline_at'));
    assert.ok(confirmationSettingsColumns.includes('reminder_milestones_text'));
    assert.ok(confirmationSettingsColumns.includes('reminder_notes_text'));
    assert.ok(confirmationSettingsColumns.includes('submitted_reminder_notes_text'));

    db.database
      .prepare("INSERT INTO Staff (name, password, role) VALUES ('admin', 'hash', 'super_admin')")
      .run();
    assert.throws(
      () => db.database.prepare("INSERT INTO Staff (name, password, role) VALUES ('root', 'hash', 'superadmin')").run(),
      /UNIQUE constraint failed/
    );

    db.database.prepare('INSERT INTO Payments (project_id, order_id, amount, payment_time, erp_record_id) VALUES (1, 1, 10, ?, ?)').run('2026-05-10 10:00:00', 'erp-1');
    assert.throws(
      () => db.database.prepare('INSERT INTO Payments (project_id, order_id, amount, payment_time, erp_record_id) VALUES (1, 2, 20, ?, ?)').run('2026-05-10 10:01:00', 'erp-1'),
      /UNIQUE constraint failed/
    );
    db.database.prepare('INSERT INTO Payments (project_id, order_id, amount, payment_time) VALUES (1, 3, 30, ?)').run('2026-05-10 10:02:00');
    db.database.prepare('INSERT INTO Payments (project_id, order_id, amount, payment_time) VALUES (1, 4, 40, ?)').run('2026-05-10 10:03:00');

    db.database.prepare("INSERT INTO Expenses (project_id, order_id, expense_type, payee_name, amount, reason, erp_record_id) VALUES (1, 1, '退款', '测试企业', 10, 'ERP退款', ?)").run('erp-refund-1');
    assert.throws(
      () => db.database.prepare("INSERT INTO Expenses (project_id, order_id, expense_type, payee_name, amount, reason, erp_record_id) VALUES (1, 2, '退款', '测试企业', 20, 'ERP退款', ?)").run('erp-refund-1'),
      /UNIQUE constraint failed/
    );

    db.database.prepare("INSERT INTO Booths (id, project_id, hall, type) VALUES ('A01', 1, '1号馆', '标摊')").run();
    assert.throws(
      () => db.database.prepare("INSERT INTO Booths (id, project_id, hall, type) VALUES ('A01', 1, '1号馆', '标摊')").run(),
      /UNIQUE constraint failed/
    );

    db.database.prepare("INSERT INTO BoothLocks (project_id, booth_id, lock_token, expires_at, created_at) VALUES (1, 'A01', 'token-1', '2026-05-10 10:10:00', '2026-05-10 10:00:00')").run();
    assert.throws(
      () => db.database.prepare("INSERT INTO BoothLocks (project_id, booth_id, lock_token, expires_at, created_at) VALUES (1, 'A01', 'token-2', '2026-05-10 10:10:00', '2026-05-10 10:00:00')").run(),
      /UNIQUE constraint failed/
    );

    db.database.exec(dropSql);
    assert.deepEqual(listTableNames(db), []);
  } finally {
    cleanup();
  }
}

{
  const { db, cleanup } = createTempDatabase();
  try {
    db.database.exec(localBootstrapSql);
    assert.deepEqual(
      listColumnNames(db, 'ExhibitionRefrigeratorRentals').filter((name) => (
        ['rental_mode', 'usage_location', 'venue_confirmed', 'venue_confirmed_by', 'venue_confirmed_at'].includes(name)
      )),
      ['rental_mode', 'usage_location', 'venue_confirmed', 'venue_confirmed_by', 'venue_confirmed_at']
    );
  } finally {
    cleanup();
  }
}

console.log('SQLite schema tests passed');
