-- Purpose: add a project-level deadline after which exhibitor confirmation links are read-only
-- Scope: confirmation settings only
-- Rollback: leave column unused or recreate ExhibitionConfirmationSettings from backup

ALTER TABLE ExhibitionConfirmationSettings ADD COLUMN collection_deadline_at TEXT NOT NULL DEFAULT '';
