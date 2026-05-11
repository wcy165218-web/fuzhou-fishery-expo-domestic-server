-- Purpose: Add Agents table for agent management
-- Scope: Production
-- Depends on: base schema

CREATE TABLE IF NOT EXISTS Agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sales_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  deleted_at TEXT,
  deleted_by TEXT,
  UNIQUE(project_id, name)
);

-- Add expense_type column to Expenses table for categorization
ALTER TABLE Expenses ADD COLUMN expense_type TEXT NOT NULL DEFAULT '其他代付';
