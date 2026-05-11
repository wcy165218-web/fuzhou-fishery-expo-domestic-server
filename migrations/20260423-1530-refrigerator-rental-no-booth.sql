-- Purpose: support no-booth refrigerator rentals with explicit rental mode and manual usage location
-- Scope: extend ExhibitionRefrigeratorRentals for manual no-booth orders without overloading exhibitor search flow
-- Rollback: recreate ExhibitionRefrigeratorRentals without rental_mode and usage_location if this feature must be fully reverted

ALTER TABLE ExhibitionRefrigeratorRentals ADD COLUMN rental_mode TEXT NOT NULL DEFAULT 'booth';
ALTER TABLE ExhibitionRefrigeratorRentals ADD COLUMN usage_location TEXT NOT NULL DEFAULT '';

UPDATE ExhibitionRefrigeratorRentals
SET rental_mode = CASE
      WHEN TRIM(COALESCE(rental_mode, '')) = 'no_booth' THEN 'no_booth'
      ELSE 'booth'
    END,
    usage_location = CASE
      WHEN TRIM(COALESCE(usage_location, '')) != '' THEN TRIM(usage_location)
      WHEN TRIM(COALESCE(hall_names, '')) = '' AND TRIM(COALESCE(booth_numbers, '')) != '' THEN TRIM(booth_numbers)
      ELSE ''
    END;