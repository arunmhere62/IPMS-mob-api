# Tenant Rent Cycle Migration

## Problem

1. **Tenant rent cycle duplication**: Multiple cycles exist for the same tenant with the same cycle_start date
2. **Cycle ID not bound to rent payments**: The `cycle_id` field in `rent_payments` table is null for many records

## Root Cause

The old schema (`pg-management-working`) had:
- `tenant_payments` table with `start_date` and `end_date` fields
- No `cycle_id` field
- No `tenant_rent_cycles` table
- No `tenant_allocations` table

The new schema (`IPMS-mob-api`) has:
- `rent_payments` table with `cycle_id` field (nullable)
- `tenant_rent_cycles` table to track rent cycles
- `tenant_allocations` table to track room/bed allocations over time

During migration, the data was transferred but:
1. Cycles were created multiple times (duplicates)
2. Payments were not linked to their corresponding cycles (cycle_id remained null)

## Migration Strategy

### SQL Migration Script (`fix_rent_cycles_migration.sql`)

A pure SQL approach that:
1. Analyzes current state (duplicates, null cycle_ids)
2. Removes duplicate cycles (keeps earliest created)
3. Cleans up invalid cycle_id references
4. Links payments to cycles using old start_date/end_date (if available) or payment sequence
5. Creates missing cycles for unlinkable payments
6. Creates missing tenant_allocations
7. Provides verification queries

**Usage:**
```bash
mysql -u username -p database_name < migrations/fix_rent_cycles_migration.sql
```

### TypeScript Migration Script (`migrate-tenant-cycles.ts`)

A programmatic approach using Prisma that:
1. Analyzes current state
2. Removes duplicate cycles (keeps earliest created)
3. Cleans up invalid cycle_id references
4. Links payments to cycles based on payment_date falling within cycle_start/cycle_end
5. Creates missing cycles for payments that can't be linked (based on PG's rent_cycle_type)
6. Creates missing tenant_allocations for tenants
7. Provides detailed verification

**Usage:**
```bash
cd IPMS-mob/IPMS-mob-api
npx ts-node migrations/migrate-tenant-cycles.ts
```

## How the API Works

### Tenant Creation (`tenant.service.ts`)

When a tenant is created:
1. Tenant record is created
2. `tenant_allocations` record is created (if bed_id provided)
3. `detectPaymentGaps()` is called to create initial rent cycles

### Rent Payment Creation (`rent-payment.service.ts`)

When a rent payment is created:
1. If `cycle_id` is provided in DTO:
   - Validates the cycle exists for the tenant
   - Uses the provided cycle_id
2. If `cycle_id` is NOT provided:
   - Computes cycle window using `computeCycleWindow()` based on:
     - PG's `rent_cycle_type` (CALENDAR or MIDMONTH)
     - Tenant's check-in date
     - Payment date
   - Calls `upsertTenantCycle()` to create/update the cycle
   - Uses the cycle_id from the created/updated cycle

### Cycle Upsert Logic

`upsertTenantCycle()` uses Prisma's `upsert` with unique constraint `tenant_id_cycle_start`:
- If cycle exists for tenant_id + cycle_start: update it
- If cycle doesn't exist: create it
- This prevents duplicate cycles for the same tenant and cycle_start

## Verification

After running the migration, verify:

1. No duplicate cycles:
```sql
SELECT tenant_id, cycle_start, COUNT(*) 
FROM tenant_rent_cycles 
GROUP BY tenant_id, cycle_start 
HAVING COUNT(*) > 1;
```

2. All payments have cycle_id (or have a valid reason for null):
```sql
SELECT COUNT(*) FROM rent_payments WHERE cycle_id IS NULL;
```

3. Cycle statistics:
```sql
SELECT 
  COUNT(DISTINCT tenant_id) as tenants_with_cycles,
  COUNT(*) as total_cycles
FRO```
AME TABLE rent_payments_backup TO rent_payments;
```

## Notes

- Test migration on a staging environment first
- The TypeScript script provides more detailed logging and error handling
- The SQL script is faster for large datasets but less flexible
