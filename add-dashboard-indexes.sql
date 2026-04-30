-- Add indexes for dashboard performance optimization
-- Check if index exists first, then create
SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics 
                     WHERE table_schema = 'indian_pg_management_v1' 
                     AND table_name = 'rent_payments' 
                     AND index_name = 'idx_tenant_payment_date');

SET @sql = IF(@index_exists = 0, 'CREATE INDEX idx_tenant_payment_date ON rent_payments(tenant_id, payment_date)', 'SELECT "Index idx_tenant_payment_date already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics 
                     WHERE table_schema = 'indian_pg_management_v1' 
                     AND table_name = 'rent_payments' 
                     AND index_name = 'idx_tenant_payment_cycle');

SET @sql = IF(@index_exists = 0, 'CREATE INDEX idx_tenant_payment_cycle ON rent_payments(tenant_id, cycle_id)', 'SELECT "Index idx_tenant_payment_cycle already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics 
                     WHERE table_schema = 'indian_pg_management_v1' 
                     AND table_name = 'rent_payments' 
                     AND index_name = 'idx_tenant_payment_status');

SET @sql = IF(@index_exists = 0, 'CREATE INDEX idx_tenant_payment_status ON rent_payments(tenant_id, status, is_deleted)', 'SELECT "Index idx_tenant_payment_status already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
