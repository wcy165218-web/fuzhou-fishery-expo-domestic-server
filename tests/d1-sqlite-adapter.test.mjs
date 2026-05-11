import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createD1SqliteDatabase } from '../src/adapter/db.mjs';

function createTempDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-d1-sqlite-'));
  const filename = path.join(dir, 'test.sqlite');
  const db = createD1SqliteDatabase(filename);
  return {
    db,
    filename,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

{
  const { db, cleanup } = createTempDatabase();
  try {
    assert.equal(db.database.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.database.pragma('synchronous', { simple: true }), 1);
    assert.equal(db.database.pragma('busy_timeout', { simple: true }), 5000);
    assert.equal(db.database.pragma('foreign_keys', { simple: true }), 1);

    await db.prepare(`
      CREATE TABLE Exhibitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        booth_code TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(name)
      )
    `).run();

    const insertResult = await db
      .prepare('INSERT INTO Exhibitors (name, booth_code) VALUES (?, ?)')
      .bind('福建海洋科技', '1A01')
      .run();

    assert.equal(insertResult.success, true);
    assert.equal(insertResult.meta.changes, 1);
    assert.equal(insertResult.meta.last_row_id, 1);
    assert.equal(insertResult.meta.lastRowId, 1);
    assert.equal(insertResult.changes, 1);
    assert.equal(insertResult.lastID, 1);

    const firstRow = await db
      .prepare("SELECT id, name, datetime(created_at) AS created_at FROM Exhibitors WHERE id = ?")
      .bind(1)
      .first();

    assert.deepEqual(Object.keys(firstRow).sort(), ['created_at', 'id', 'name']);
    assert.equal(firstRow.name, '福建海洋科技');
    assert.match(firstRow.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    assert.equal(
      await db.prepare('SELECT booth_code FROM Exhibitors WHERE id = ?').bind(1).first('booth_code'),
      '1A01'
    );
    assert.equal(await db.prepare('SELECT booth_code FROM Exhibitors WHERE id = ?').bind(99).first(), null);

    const allRows = await db
      .prepare("SELECT name || ? AS label FROM Exhibitors WHERE name = ? COLLATE NOCASE")
      .bind(' / 已确认', '福建海洋科技')
      .all();

    assert.deepEqual(allRows, {
      results: [{ label: '福建海洋科技 / 已确认' }]
    });

    await db.prepare(`
      CREATE TABLE DailyCounters (
        counter_key TEXT PRIMARY KEY COLLATE NOCASE,
        counter_value INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      INSERT INTO DailyCounters (counter_key, counter_value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(counter_key) DO UPDATE SET
        counter_value = DailyCounters.counter_value + excluded.counter_value,
        updated_at = datetime('now')
    `).bind('Upload', 2).run();

    await db.prepare(`
      INSERT INTO DailyCounters (counter_key, counter_value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(counter_key) DO UPDATE SET
        counter_value = DailyCounters.counter_value + excluded.counter_value,
        updated_at = datetime('now')
    `).bind('upload', 3).run();

    const counter = await db
      .prepare("SELECT counter_key, counter_value, strftime('%Y', updated_at) AS update_year FROM DailyCounters WHERE counter_key = ? COLLATE NOCASE")
      .bind('UPLOAD')
      .first();

    assert.equal(counter.counter_key, 'Upload');
    assert.equal(counter.counter_value, 5);
    assert.match(counter.update_year, /^\d{4}$/);
  } finally {
    cleanup();
  }
}

{
  const { db, cleanup } = createTempDatabase();
  try {
    await db.prepare('CREATE TABLE BatchItems (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)').run();

    const batchResult = await db.batch([
      db.prepare('INSERT INTO BatchItems (name) VALUES (?)').bind('alpha'),
      db.prepare('INSERT INTO BatchItems (name) VALUES (?)').bind('beta')
    ]);

    assert.equal(batchResult.length, 2);
    assert.deepEqual(batchResult.map((result) => result.meta.changes), [1, 1]);
    assert.deepEqual(
      (await db.prepare('SELECT name FROM BatchItems ORDER BY id').all()).results.map((row) => row.name),
      ['alpha', 'beta']
    );

    await assert.rejects(
      db.batch([
        db.prepare('INSERT INTO BatchItems (name) VALUES (?)').bind('gamma'),
        db.prepare('INSERT INTO BatchItems (name) VALUES (?)').bind('alpha')
      ]),
      (error) => {
        assert.equal(error.sql.includes('INSERT INTO BatchItems'), true);
        assert.match(error.message, /SQLite query failed/);
        return true;
      }
    );

    assert.deepEqual(
      (await db.prepare('SELECT name FROM BatchItems ORDER BY id').all()).results.map((row) => row.name),
      ['alpha', 'beta'],
      'failed batch should roll back earlier statements'
    );
  } finally {
    cleanup();
  }
}

{
  const first = createTempDatabase();
  const second = createTempDatabase();
  try {
    await first.db.prepare('CREATE TABLE CrossDbItems (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)').run();
    await second.db.prepare('CREATE TABLE CrossDbItems (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)').run();

    await assert.rejects(
      first.db.batch([
        second.db.prepare('INSERT INTO CrossDbItems (name) VALUES (?)').bind('wrong-db')
      ]),
      /same database/
    );
  } finally {
    first.cleanup();
    second.cleanup();
  }
}

console.log('D1 SQLite adapter tests passed');
