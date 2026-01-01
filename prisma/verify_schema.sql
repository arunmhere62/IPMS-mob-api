-- Verification queries for new database structure

-- 1. Show all tables in database
SHOW TABLES;

-- 2. Verify users table structure (should NOT have pg_id column)
DESCRIBE users;

-- 3. Verify organization table structure (should have superadmin_id)
DESCRIBE organization;

-- 4. Verify pg_locations table structure (should NOT have user_id column)
DESCRIBE pg_locations;

-- 5. Verify pg_users junction table exists
DESCRIBE pg_users;

-- 6. Check foreign keys on users table
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'pgmanp7o_pg_mobile_app_v2'
AND TABLE_NAME = 'users'
AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 7. Check foreign keys on pg_locations table
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'pgmanp7o_pg_mobile_app_v2'
AND TABLE_NAME = 'pg_locations'
AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 8. Check foreign keys on pg_users table
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'pgmanp7o_pg_mobile_app_v2'
AND TABLE_NAME = 'pg_users'
AND REFERENCED_TABLE_NAME IS NOT NULL;
