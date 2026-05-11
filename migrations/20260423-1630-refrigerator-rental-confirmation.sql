-- Purpose: add venue confirmation state to refrigerator rentals for on-site confirmation and rejection flows
-- Scope: extend ExhibitionRefrigeratorRentals with confirmation status and audit fields
-- Rollback: recreate ExhibitionRefrigeratorRentals without venue_confirmed, venue_confirmed_by, venue_confirmed_at if the confirmation flow must be removed

ALTER TABLE ExhibitionRefrigeratorRentals ADD COLUMN venue_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ExhibitionRefrigeratorRentals ADD COLUMN venue_confirmed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE ExhibitionRefrigeratorRentals ADD COLUMN venue_confirmed_at TEXT NOT NULL DEFAULT '';

UPDATE ExhibitionRefrigeratorRentals
SET venue_confirmed = CASE WHEN COALESCE(venue_confirmed, 0) = 1 THEN 1 ELSE 0 END,
    venue_confirmed_by = TRIM(COALESCE(venue_confirmed_by, '')),
    venue_confirmed_at = TRIM(COALESCE(venue_confirmed_at, ''));