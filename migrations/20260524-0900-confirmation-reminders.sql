-- Purpose: add project-level exhibitor confirmation reminder copy
-- Scope: confirmation settings only
-- Rollback: leave columns unused or recreate ExhibitionConfirmationSettings from backup

ALTER TABLE ExhibitionConfirmationSettings ADD COLUMN reminder_milestones_text TEXT NOT NULL DEFAULT '';
ALTER TABLE ExhibitionConfirmationSettings ADD COLUMN reminder_notes_text TEXT NOT NULL DEFAULT '';
ALTER TABLE ExhibitionConfirmationSettings ADD COLUMN submitted_reminder_notes_text TEXT NOT NULL DEFAULT '';
