-- Purpose: Add secondary indexes for tables that previously only had primary keys / unique constraints.
-- Scope: Production / remote D1 and any environment upgraded from earlier schema versions.
-- All statements use IF NOT EXISTS so this migration is safe to re-run.
-- Rollback: DROP INDEX IF EXISTS <name>; for each index listed below.

CREATE INDEX IF NOT EXISTS idx_agents_project_deleted_sales
ON Agents (project_id, deleted_at, sales_name);

CREATE INDEX IF NOT EXISTS idx_order_booth_changes_project_order_changed_at
ON OrderBoothChanges (project_id, order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_overpayment_issues_project_status
ON OrderOverpaymentIssues (project_id, status);

CREATE INDEX IF NOT EXISTS idx_expenses_project_type_deleted
ON Expenses (project_id, expense_type, deleted_at);
