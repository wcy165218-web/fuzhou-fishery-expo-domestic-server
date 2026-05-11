import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

function redactSql(sql) {
    return String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function withSqlContext(error, sql) {
    const wrapped = new Error(`SQLite query failed: ${error?.message || error}`);
    wrapped.cause = error;
    wrapped.sql = redactSql(sql);
    return wrapped;
}

function buildRunResult(info) {
    return {
        success: true,
        meta: {
            changes: info.changes,
            last_row_id: info.lastInsertRowid,
            lastRowId: info.lastInsertRowid
        },
        changes: info.changes,
        lastID: info.lastInsertRowid
    };
}

class D1PreparedStatement {
    constructor(database, sql, params = []) {
        this.database = database;
        this.sql = String(sql || '');
        this.params = params;
    }

    bind(...params) {
        return new D1PreparedStatement(this.database, this.sql, params);
    }

    async first(columnName) {
        try {
            const row = this.database.prepare(this.sql).get(...this.params);
            if (!row) return null;
            if (columnName) return row[columnName];
            return row;
        } catch (error) {
            throw withSqlContext(error, this.sql);
        }
    }

    async all() {
        try {
            return {
                results: this.database.prepare(this.sql).all(...this.params)
            };
        } catch (error) {
            throw withSqlContext(error, this.sql);
        }
    }

    async run() {
        try {
            const info = this.database.prepare(this.sql).run(...this.params);
            return buildRunResult(info);
        } catch (error) {
            throw withSqlContext(error, this.sql);
        }
    }
}

export class D1SqliteDatabase {
    constructor(filename, { readonly = false } = {}) {
        const resolvedFilename = path.resolve(String(filename || ''));
        fs.mkdirSync(path.dirname(resolvedFilename), { recursive: true });
        this.filename = resolvedFilename;
        this.database = new Database(resolvedFilename, { readonly });
        this.applyStartupPragmas();
    }

    applyStartupPragmas() {
        this.database.pragma('journal_mode = WAL');
        this.database.pragma('synchronous = NORMAL');
        this.database.pragma('busy_timeout = 5000');
        this.database.pragma('foreign_keys = ON');
    }

    prepare(sql) {
        return new D1PreparedStatement(this.database, sql);
    }

    async batch(statements = []) {
        const list = Array.isArray(statements) ? statements : [];
        const executeBatch = this.database.transaction(() => {
            const output = [];
            for (const statement of list) {
                if (!statement || typeof statement.run !== 'function') {
                    throw new TypeError('DB.batch() expects prepared statements');
                }
                if (statement.database !== this.database) {
                    throw new TypeError('DB.batch() statements must come from the same database');
                }
                const info = this.database.prepare(statement.sql).run(...statement.params);
                output.push(buildRunResult(info));
            }
            return output;
        });
        try {
            return executeBatch();
        } catch (error) {
            throw withSqlContext(error, list.map((statement) => statement?.sql).filter(Boolean).join('; '));
        }
    }

    close() {
        this.database.close();
    }
}

export function createD1SqliteDatabase(filename, options) {
    return new D1SqliteDatabase(filename, options);
}
