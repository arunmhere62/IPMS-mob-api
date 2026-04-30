-- Delete rent payments from target database
-- Run this on the target database (indian_pg_management_v1)

DELETE FROM rent_payments WHERE 1=1;

-- Optionally, also delete tenant_rent_cycles to regenerate them
-- DELETE FROM tenant_rent_cycles WHERE 1=1;
