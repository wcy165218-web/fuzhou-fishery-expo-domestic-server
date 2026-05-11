-- Purpose: upgrade staff roles to explicit super_admin semantics and enforce a single super admin record
-- Scope: production D1 schema/data migration for Staff role normalization
-- Rollback: manually change the protected account role back to admin and drop idx_staff_single_super_admin if needed

UPDATE Staff
SET role = 'user'
WHERE LOWER(TRIM(role)) = 'sales';

UPDATE Staff
SET role = 'super_admin'
WHERE name = 'admin'
  AND LOWER(TRIM(role)) = 'admin';

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_single_super_admin
  ON Staff ((1))
  WHERE LOWER(TRIM(role)) IN ('super_admin', 'superadmin');