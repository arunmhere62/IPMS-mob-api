# Rent Cycle System — Business Logic & Architecture

---

## 1. Database Tables Involved

```
pg_locations
  ├── rent_cycle_type    : CALENDAR | MIDMONTH
  ├── rent_cycle_start   : Day number (e.g., 1 = 1st of month) — used for CALENDAR
  └── rent_cycle_end     : (informational, not used in calculations)

tenants
  ├── check_in_date      : Tenant moved in (anchor for first cycle)
  ├── check_out_date     : Tenant moved out (null if still active)
  ├── pg_id              : Which PG → gives us cycle type
  └── bed_id             : Current bed → gives us current price

tenant_allocations       ← Price history (when tenant transfers beds)
  ├── tenant_id
  ├── effective_from     : Date this bed/price became effective
  ├── effective_to       : Date this allocation ended (null = still active)
  └── bed_price_snapshot : Bed price at time of allocation (IMPORTANT for historical accuracy)

tenant_rent_cycles       ← One row per calendar period per tenant
  ├── tenant_id
  ├── cycle_type         : CALENDAR | MIDMONTH
  ├── anchor_day         : Day of month the cycle starts on
  ├── cycle_start        : Period start date
  └── cycle_end          : Period end date
  -- UNIQUE (tenant_id, cycle_start)

rent_payments            ← Actual money received
  ├── tenant_id
  ├── cycle_id           : FK → tenant_rent_cycles.s_no (links payment to a period)
  ├── amount_paid
  └── status             : PAID | PARTIAL | PENDING | VOIDED
```

**Key relationship:**
`rent_payments.cycle_id → tenant_rent_cycles.s_no`
This is the source of truth: each payment belongs to a specific rent cycle.

---

## 2. The Two Rent Cycle Types

### CALENDAR
- Anchor day = `pg_locations.rent_cycle_start` (usually 1)
- Cycles always run **1st to last day of each calendar month**
- First cycle may be **prorated** if tenant checks in mid-month

```
Tenant checks in: Jan 15
Cycle 1 (prorated): Jan 15 → Jan 31   (17 days out of 31 → rent = 17/31 × monthly_rent)
Cycle 2 (full):     Feb 01 → Feb 28
Cycle 3 (full):     Mar 01 → Mar 31
```

### MIDMONTH
- Anchor day = day of `tenants.check_in_date`
- Cycles run **from check-in day each month to the day before the same day next month**
- Edge case: anchor=31 in Feb → clamps to Feb 28/29

```
Tenant checks in: Jan 15 (anchor_day = 15)
Cycle 1: Jan 15 → Feb 14
Cycle 2: Feb 15 → Mar 14
Cycle 3: Mar 15 → Apr 14

Tenant checks in: Jan 31 (anchor_day = 31)
Cycle 1: Jan 31 → Feb 27 (Feb has no 31st → clamp to Feb 28, end = Feb 27)
Cycle 2: Feb 28 → Mar 30
Cycle 3: Mar 31 → Apr 29
```

---

## 3. Expected Rent Calculation (Proration)

### Full cycle (tenant present all days):
```
expected_rent = monthly_rent (from bed_price_snapshot)
```

### Partial first cycle (CALENDAR — checked in mid-month):
```
days_in_period = cycle_end - cycle_start + 1   (e.g., Jan 15→31 = 17 days)
days_in_month  = total days in that month       (Jan = 31)
expected_rent  = (monthly_rent / days_in_month) × days_in_period
               = (10000 / 31) × 17 = ₹5,484
```

### Which price to use:
- Look up `tenant_allocations` for the allocation that was **effective on cycle_start date**
- If multiple allocations exist (bed transfers), use the one where `effective_from <= cycle_start <= effective_to`
- Fallback: `beds.bed_price` (current price)
- **Never use current bed price for old cycles** — use the snapshot

---

## 4. Payment Status Per Cycle

```
paid_amount = SUM of amount_paid from rent_payments WHERE cycle_id = cycle.s_no AND status != VOIDED

if paid_amount >= expected_rent  → PAID
if 0 < paid_amount < expected_rent → PARTIAL   (due = expected_rent - paid_amount)
if paid_amount == 0              → PENDING     (due = expected_rent)
```

---

## 5. How Cycles Are Created (Current State)

Right now cycles are only created in **one place**:
- `detectPaymentGaps()` in `rent-payment.service.ts` — called manually via `GET /rent-payments/gaps/:tenant_id`

**Problem:** If no one calls this endpoint, `tenant_rent_cycles` table is empty.
`buildRentSummary` currently **ignores** `tenant_rent_cycles` entirely and regenerates periods dynamically from `check_in_date` — so the DB table is mostly unused for display.

---

## 6. Current Code Problems

| Service | Problem |
|---|---|
| `TenantRentSummaryService` | Regenerates periods from scratch every call. Ignores `cycle_id` on payments — uses sequential/date matching which is wrong when payments cover different cycles |
| `PendingRentCalculatorService` | Completely separate implementation of the same logic. Uses `start_date`/`end_date` fields on payments that don't exist in the actual DB schema. Dead code. |
| `detectPaymentGaps` (300+ lines) | Creates cycles AND detects gaps AND calculates rent — three responsibilities in one method |
| `RentCycleCalculatorService` | Good utility functions but not used by the rent summary logic |

---

## 7. Proposed Clean Architecture

### Single Responsibility Design

```
┌─────────────────────────────────┐
│  CYCLE CREATION (write once)    │
│  - On tenant check-in           │
│  - Nightly cron (midnight IST)  │
│  Uses: createMany + skipDuplicates (safe, idempotent)
└─────────────────────────────────┘
              ↓ writes to tenant_rent_cycles

┌─────────────────────────────────┐
│  buildRentSummary (read only)   │
│  - Reads tenant_rent_cycles     │
│  - Groups rent_payments by      │
│    cycle_id                     │
│  - Uses bed_price_snapshot      │
│    for expected rent            │
│  ~50 lines total                │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  DELETE entirely                │
│  - PendingRentCalculatorService │
│  - generatePeriods()            │
│  - matchPaymentsToPeriods()     │
└─────────────────────────────────┘
```

### Clean `buildRentSummary` Logic (pseudocode)

```typescript
buildRentSummary(tenant) {
  // 1. Get all cycles that have started
  const cycles = tenant.tenant_rent_cycles
    .filter(c => c.cycle_start <= today)
    .sort by cycle_start ASC

  // 2. Group payments by cycle_id (ignore VOIDED)
  const paymentsByCycle = groupBy(tenant.rent_payments, p => p.cycle_id)

  // 3. Per cycle: calculate expected rent + status
  for each cycle:
    price = getAllocationPrice(tenant.tenant_allocations, cycle.cycle_start)
            ?? tenant.beds.bed_price

    expected = prorate(price, cycle.cycle_start, cycle.cycle_end)
    paid     = sum(paymentsByCycle[cycle.id])
    status   = paid >= expected ? PAID : paid > 0 ? PARTIAL : PENDING
    due      = max(0, expected - paid)

  // 4. Aggregate
  return { periods, partial_due, pending_due, payment_status, current_cycle }
}
```

### Cycle Creation (safe, idempotent)

```typescript
// Called on check-in AND nightly cron
async createMissingCycles(tenantId) {
  const tenant = fetch(tenant with pg_locations)
  const existing = fetch existing tenant_rent_cycles

  const toCreate = []
  let cursor = check_in_date

  while (cursor <= today) {
    next = computeNextCycle(cursor, cycleType, anchorDay)
    if (!exists in DB) toCreate.push(next)
    cursor = next.end + 1 day
  }

  await prisma.tenant_rent_cycles.createMany({
    data: toCreate,
    skipDuplicates: true   // ← makes this 100% safe to call multiple times
  })
}
```

**Why `skipDuplicates` makes the cron safe:**
The DB has `UNIQUE(tenant_id, cycle_start)`. If the cron runs twice or a cycle already exists, it simply skips — no error, no duplicate data.

---

## 8. Implementation Plan

```
Step 1: Create RentCycleCreationService
        - createMissingCycles(tenantId)
        - createMissingCyclesForAllTenants()  ← used by cron

Step 2: Rewrite buildRentSummary (50 lines)
        - Read tenant_rent_cycles from DB
        - Match payments by cycle_id
        - Use bed_price_snapshot for price

Step 3: Update tenant findAll + findOne queries
        - Include tenant_rent_cycles, tenant_allocations, cycle_id on rent_payments

Step 4: Update dashboard getTenantStatusWidgets
        - Same includes as step 3

Step 5: Create nightly cron (midnight IST)
        - Calls createMissingCyclesForAllTenants()
        - Manual trigger endpoint for testing

Step 6: Call createMissingCycles on tenant check-in
        - Inside tenant create/update service

Step 7: Delete dead code
        - PendingRentCalculatorService
        - generatePeriods, matchPaymentsToPeriods
        - 300-line detectPaymentGaps bulk logic
```

---

## 9. API Data Shape Needed

For `buildRentSummary` to work, each tenant object needs:

```typescript
{
  check_in_date,
  check_out_date,
  beds: { bed_price },
  pg_locations: { rent_cycle_type, rent_cycle_start },
  tenant_rent_cycles: [{ s_no, cycle_type, cycle_start, cycle_end }],
  tenant_allocations: [{ effective_from, effective_to, bed_price_snapshot }],
  rent_payments: [{ s_no, cycle_id, amount_paid, status, payment_date }]
}
```
