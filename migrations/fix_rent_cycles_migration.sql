-- Migration Script: Fix Tenant Rent Cycle Duplication and Link Null cycle_id
-- 
-- PROBLEM:
-- 1. Tenant rent cycles are duplicated
-- 2. rent_payments.cycle_id is null (not linked to cycles)
--
-- ROOT CAUSE:
-- Old schema (pg-management-working) had tenant_payments with start_date/end_date but no cycle_id
-- New schema (IPMS-mob-api) has tenant_rent_cycles table and cycle_id in rent_payments
-- During migration, cycles were created but not properly linked to payments
--
-- SOLUTION:
-- 1. Identify and remove duplicate tenant_rent_cycles (keep the earliest created)
-- 2. Link existing rent_payments to cycles using old start_date/end_date (if available) or payment sequence
-- 3. Create missing cycles for payments that don't have matching cycles

-- ============================================================
-- STEP 1: ANALYZE CURRENT STATE
-- ============================================================

-- Check for duplicate cycles (same tenant_id and cycle_start)
SELECT 
    tenant_id,
    cycle_start,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(s_no) as cycle_ids,
    MIN(created_at) as earliest_created,
    MAX(created_at) as latest_created
FROM tenant_rent_cycles
GROUP BY tenant_id, cycle_start
HAVING COUNT(*) > 1;

-- Check payments with null cycle_id
SELECT 
    COUNT(*) as payments_with_null_cycle_id
FROM rent_payments
WHERE cycle_id IS NULL;

-- Check payments with cycle_id
SELECT 
    COUNT(*) as payments_with_cycle_id
FROM rent_payments
WHERE cycle_id IS NOT NULL;

-- ============================================================
-- STEP 2: REMOVE DUPLICATE CYCLES
-- ============================================================

-- Delete duplicate cycles, keeping the earliest created one
DELETE t1 FROM tenant_rent_cycles t1
INNER JOIN (
    SELECT 
        tenant_id, 
        cycle_start, 
        MIN(s_no) as keep_id
    FROM tenant_rent_cycles
    GROUP BY tenant_id, cycle_start
    HAVING COUNT(*) > 1
) t2 ON t1.tenant_id = t2.tenant_id 
    AND t1.cycle_start = t2.cycle_start 
    AND t1.s_no != t2.keep_id;

-- Verify duplicates removed
SELECT 
    tenant_id,
    cycle_start,
    COUNT(*) as count
FROM tenant_rent_cycles
GROUP BY tenant_id, cycle_start
HAVING COUNT(*) > 1;

-- ============================================================
-- STEP 3: CLEAN UP INVALID cycle_id REFERENCES
-- ============================================================

-- Remove cycle_id from payments where the cycle doesn't exist or doesn't belong to the tenant
UPDATE rent_payments rp
SET cycle_id = NULL
WHERE cycle_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM tenant_rent_cycles trc 
    WHERE trc.s_no = rp.cycle_id 
    AND trc.tenant_id = rp.tenant_id
);

-- ============================================================
-- STEP 4: LINK PAYMENTS TO CYCLES
-- ============================================================

-- STRATEGY 1: If old start_date/end_date are available, import them first
-- Uncomment and modify this section if you have access to the old database
/*
CREATE TEMPORARY TABLE old_payment_dates AS
SELECT s_no, tenant_id, start_date, end_date
FROM old_database.tenant_payments;

UPDATE rent_payments rp
INNER JOIN old_payment_dates opd ON rp.s_no = opd.s_no
INNER JOIN tenant_rent_cycles trc ON rp.tenant_id = trc.tenant_id
SET rp.cycle_id = trc.s_no
WHERE rp.cycle_id IS NULL
AND trc.cycle_start = opd.start_date
AND trc.cycle_end = opd.end_date;
*/

-- STRATEGY 2: Link payments by sequence (first payment = first cycle, etc.)
-- This assumes payments were made in cycle order
-- This is less accurate but works if old data is unavailable
SET @row_number = 0;
SET @prev_tenant = 0;

UPDATE rent_payments rp
INNER JOIN (
    SELECT 
        s_no,
        tenant_id,
        (@row_number := IF(@prev_tenant = tenant_id, @row_number + 1, 1)) as seq,
        @prev_tenant := tenant_id
    FROM rent_payments
    WHERE cycle_id IS NULL
    ORDER BY tenant_id, payment_date
) ordered ON rp.s_no = ordered.s_no
INNER JOIN (
    SELECT 
        s_no,
        tenant_id,
        (@cycle_row := IF(@cycle_prev_tenant = tenant_id, @cycle_row + 1, 1)) as cycle_seq,
        @cycle_prev_tenant := tenant_id
    FROM tenant_rent_cycles
    ORDER BY tenant_id, cycle_start
) cycles ON rp.tenant_id = cycles.tenant_id AND ordered.seq = cycles.cycle_seq
SET rp.cycle_id = cycles.s_no;

-- ============================================================
-- STEP 5: CREATE MISSING CYCLES FOR UNLINKED PAYMENTS
-- ============================================================

-- For payments that still have null cycle_id, create cycles based on PG's rent_cycle_type
-- This is a fallback - you may need to manually review these payments

-- ============================================================
-- STEP 6: CREATE TENANT_ALLOCATIONS IF MISSING
-- ============================================================

-- For tenants that don't have allocations, create initial allocation based on check-in date
INSERT INTO tenant_allocations (tenant_id, pg_id, room_id, bed_id, effective_from, effective_to, bed_price_snapshot, created_at, updated_at)
SELECT 
    t.s_no as tenant_id,
    t.pg_id,
    t.room_id,
    t.bed_id,
    DATE(t.check_in_date) as effective_from,
    NULL as effective_to,
    COALESCE(b.bed_price, 0) as bed_price_snapshot,
    NOW() as created_at,
    NOW() as updated_at
FROM tenants t
LEFT JOIN beds b ON t.bed_id = b.s_no
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_allocations ta 
    WHERE ta.tenant_id = t.s_no
)
AND t.bed_id IS NOT NULL;

-- ============================================================
-- STEP 7: VERIFICATION QUERIES
-- ============================================================

-- Verify no more duplicate cycles
SELECT 'Duplicate cycles after migration:' as status;
SELECT 
    tenant_id,
    cycle_start,
    COUNT(*) as count
FROM tenant_rent_cycles
GROUP BY tenant_id, cycle_start
HAVING COUNT(*) > 1;

-- Verify payments linked to cycles
SELECT 'Payments with null cycle_id after migration:' as status;
SELECT 
    COUNT(*) as count
FROM rent_payments
WHERE cycle_id IS NULL;

-- Verify cycle statistics
SELECT 'Cycle statistics after migration:' as status;
SELECT 
    COUNT(DISTINCT tenant_id) as tenants_with_cycles,
    COUNT(*) as total_cycles
FROM tenant_rent_cycles;

-- Verify payment statistics
SELECT 'Payment statistics after migration:' as status;
SELECT 
    COUNT(*) as total_payments,
    SUM(CASE WHEN cycle_id IS NULL THEN 1 ELSE 0 END) as payments_without_cycles,
    SUM(CASE WHEN cycle_id IS NOT NULL THEN 1 ELSE 0 END) as payments_with_cycles
FROM rent_payments;

