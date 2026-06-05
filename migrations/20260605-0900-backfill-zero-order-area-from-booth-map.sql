-- Purpose: Backfill active non-joint orders whose saved area is 0 from booth map / booth master data.
-- Notes:
--   - Only single-booth active orders are updated.
--   - Orders sharing the same booth with another active order are skipped to preserve joint-exhibition area splits.

UPDATE Orders
SET area = ROUND(
    COALESCE(
        (
            SELECT bmi.area
            FROM BoothMapItems bmi
            WHERE bmi.project_id = Orders.project_id
              AND UPPER(bmi.booth_code) = UPPER(TRIM(Orders.booth_id))
              AND COALESCE(bmi.area, 0) > 0
            LIMIT 1
        ),
        (
            SELECT b.area
            FROM Booths b
            WHERE b.project_id = Orders.project_id
              AND UPPER(b.id) = UPPER(TRIM(Orders.booth_id))
              AND COALESCE(b.area, 0) > 0
            LIMIT 1
        ),
        0
    ),
    2
),
price_unit = COALESCE(
    NULLIF(price_unit, ''),
    (
        SELECT b.price_unit
        FROM Booths b
        WHERE b.project_id = Orders.project_id
          AND UPPER(b.id) = UPPER(TRIM(Orders.booth_id))
        LIMIT 1
    ),
    CASE
        WHEN COALESCE((
            SELECT bmi.booth_type
            FROM BoothMapItems bmi
            WHERE bmi.project_id = Orders.project_id
              AND UPPER(bmi.booth_code) = UPPER(TRIM(Orders.booth_id))
            LIMIT 1
        ), '') = '光地' THEN '平米'
        ELSE '个'
    END
)
WHERE status = '正常'
  AND COALESCE(area, 0) <= 0
  AND COALESCE(TRIM(booth_id), '') != ''
  AND INSTR(booth_id, ',') = 0
  AND INSTR(booth_id, '，') = 0
  AND INSTR(booth_id, '、') = 0
  AND INSTR(booth_id, ';') = 0
  AND INSTR(booth_id, '/') = 0
  AND NOT EXISTS (
      SELECT 1
      FROM Orders other
      WHERE other.project_id = Orders.project_id
        AND other.status = '正常'
        AND other.id <> Orders.id
        AND INSTR(
            ',' || REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            REPLACE(UPPER(COALESCE(other.booth_id, '')), ' ', ''),
                            '，',
                            ','
                        ),
                        '、',
                        ','
                    ),
                    ';',
                    ','
                ),
                '/',
                ','
            ) || ',',
            ',' || UPPER(TRIM(Orders.booth_id)) || ','
        ) > 0
  )
  AND COALESCE(
      (
          SELECT bmi.area
          FROM BoothMapItems bmi
          WHERE bmi.project_id = Orders.project_id
            AND UPPER(bmi.booth_code) = UPPER(TRIM(Orders.booth_id))
            AND COALESCE(bmi.area, 0) > 0
          LIMIT 1
      ),
      (
          SELECT b.area
          FROM Booths b
          WHERE b.project_id = Orders.project_id
            AND UPPER(b.id) = UPPER(TRIM(Orders.booth_id))
            AND COALESCE(b.area, 0) > 0
          LIMIT 1
      ),
      0
  ) > 0;
