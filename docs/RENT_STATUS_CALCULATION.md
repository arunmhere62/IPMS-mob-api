# Rent Status Calculation Documentation

## Overview

This document explains how the system calculates tenant rent status (PAID, PARTIAL, PENDING, NO_PAYMENT) for the tenant list, tenant details, and dashboard APIs.

## Architecture

The rent status calculation involves three main services:

1. **`TenantRentSummaryService`** (`tenant-rent-summary.service.ts`)
   - Core rent calculation logic
   - Generates rent cycles (dynamically or from DB)
   - Computes per-cycle payment status

2. **`TenantStatusService`** (`tenant-status/tenant-status.service.ts`)
   - Derives final rent flags (`is_rent_paid`, `is_rent_partial`)
   - Filters tenants for dashboard views (pending, partial, without advance)

3. **`RentCalculationUtil`** (`rent-calculation.util.ts`)
   - Utility functions for prorated rent calculations
   - Handles CALENDAR and MIDMONTH cycle types

---

## Rent Cycle Types

### 1. CALENDAR Cycle
- **Period**: 1st of month to last day of month
- **Example**: January 1-31, February 1-28/29
- **Prorated**: Yes, if tenant checks in after the 1st of their joining month

### 2. MIDMONTH Cycle
- **Period**: Based on tenant's check-in day
- **Example**: If check-in is 15th, cycles run 15th-14th
- **Anchor Day**: The day of month from tenant's check-in date

---

## How Rent Status is Calculated

### Step 1: Generate Rent Cycles

**Dynamic Mode (for List/Dashboard views):**
```typescript
generateDynamicRentCycles({
  checkInDate: tenant.check_in_date,
  checkOutDate: tenant.check_out_date,
  cycleType: 'CALENDAR' | 'MIDMONTH',
  anchorDay?: number
})
```
- Generates cycles from check-in date to current date
- No database persistence (fast, no I/O)
- Used in: `findAll()`, `getTenantStatusWidgets()`

**DB Mode (for Tenant Details):**
- Uses persisted `tenant_rent_cycles` from database
- Cycles created via `detectPaymentGaps()`
- Used in: `findOne()`

### Step 2: Calculate Per-Cycle Status

For each rent cycle, the status is determined:

```typescript
// From tenant-rent-summary.service.ts lines 162-169
let status: 'NO_PAYMENT' | 'PAID' | 'PARTIAL' | 'PENDING' | 'FAILED' = 'NO_PAYMENT';
if (due > 0) {
  if (totalPaid >= due) status = 'PAID';
  else if (totalPaid > 0) status = 'PARTIAL';
  else status = 'NO_PAYMENT';
}
```

| Status | Condition |
|--------|-----------|
| **PAID** | `totalPaid >= due` (full payment received) |
| **PARTIAL** | `totalPaid > 0` but `< due` (some payment, but incomplete) |
| **NO_PAYMENT** | `totalPaid === 0` (no payment for this cycle) |

### Step 3: Calculate Overall Payment Status

The `payment_status` is based on the **current/relevant cycle**:

```typescript
// From tenant-rent-summary.service.ts lines 339
const payment_status = (relevantCycle)?.status || 'NO_PAYMENT';
```

- Finds cycle containing today's date
- Falls back to most recent started cycle
- Returns that cycle's status

### Step 4: Calculate Due Amounts

**Partial Due Amount:**
```typescript
// From tenant-rent-summary.service.ts lines 341-343
const underpaidCycles = cycleSummaries.filter(s => s.status === 'PARTIAL' && s.remainingDue > 0);
const partial_due_amount = underpaidCycles.reduce((sum, s) => sum + s.remainingDue, 0);
```
- Sum of all cycles with PARTIAL status
- Only includes remaining due amount

**Pending Due Amount:**
```typescript
// From tenant-rent-summary.service.ts lines 347-366
const pending_due_amount = unpaidMonths.reduce((sum, m) => {
  // Calculate expected rent for each unpaid month
  // Uses allocation-based pricing or bed price fallback
}, 0);
```
- Sum of rent for all unpaid months (NO_PAYMENT cycles)
- Calculated from check-in to current date

**Total Rent Due:**
```typescript
const rent_due_amount = partial_due_amount + pending_due_amount;
```

### Step 5: Derive Rent Flags

```typescript
// From tenant-status.service.ts lines 92-109
deriveRentFlags({
  paymentStatus: string,
  unpaidMonthsCount: number,
  partialDueAmount: number
}): { is_rent_paid: boolean; is_rent_partial: boolean }
```

| Flag | Condition |
|------|-----------|
| `is_rent_paid` | `unpaidMonthsCount === 0 && paymentStatus === 'PAID' && partialDueAmount === 0` |
| `is_rent_partial` | `partialDueAmount > 0` |

---

## Filtering Logic

### Pending Rent Filter
```typescript
// From tenant-status.service.ts lines 230-253
getTenantsWithPendingRent(tenants) {
  return tenants.filter(t => {
    if (t.status !== 'ACTIVE') return false;
    if (t.partial_due_amount > 0) return false; // Exclude partial
    
    const hasUnpaidMonths = t.unpaid_months?.length > 0;
    const hasPendingOrFailed = t.rent_payments?.some(p => p.status === 'PENDING' || p.status === 'FAILED');
    
    return hasPendingOrFailed || hasUnpaidMonths;
  });
}
```

**Key Rule**: A tenant with partial due is shown in **Partial** tab, NOT **Pending** tab.

### Partial Rent Filter
```typescript
// From tenant-status.service.ts lines 259-268
getTenantsWithPartialRent(tenants) {
  return tenants.filter(t => {
    if (t.status !== 'ACTIVE') return false;
    return t.partial_due_amount > 0;
  });
}
```

---

## Example Scenarios

### Scenario 1: Fully Paid Tenant
- Rent: ₹8000/month
- Payments: ₹8000 for current cycle
- Status: **PAID**
- `is_rent_paid`: `true`
- `is_rent_partial`: `false`

### Scenario 2: Partial Payment
- Rent: ₹8000/month
- Payments: ₹5000 for current cycle (₹3000 remaining)
- Status: **PARTIAL**
- `partial_due_amount`: ₹3000
- `is_rent_partial`: `true`
- `is_rent_paid`: `false`

### Scenario 3: No Payment
- Rent: ₹8000/month
- Payments: None for current cycle
- Status: **NO_PAYMENT** (shown as PENDING)
- `pending_due_amount`: ₹8000
- `unpaid_months`: [current month]
- `is_rent_paid`: `false`

### Scenario 4: Multiple Months
- Rent: ₹8000/month
- Current cycle: PAID (₹8000)
- Previous cycle: PARTIAL (₹4000 paid, ₹4000 due)
- Two cycles before: NO_PAYMENT (₹8000 due)
- `partial_due_amount`: ₹4000
- `pending_due_amount`: ₹8000
- `rent_due_amount`: ₹12000
- `is_rent_partial`: `true` (because partial > 0)
- `is_rent_paid`: `false` (because unpaid months > 0)

---

## Dynamic vs DB Mode

### Dynamic Mode (`buildRentSummaryDynamic`)
**Used in**: Tenant list, Dashboard

**Pros:**
- Fast (no database writes)
- No risk of stale data
- No gap detection needed

**Cons:**
- Doesn't persist cycle data
- Cycle IDs are negative (indicating dynamic)

**Flow:**
```
Query tenants → Generate dynamic cycles → Calculate rent summary → Return
```

### DB Mode (`buildRentSummary`)
**Used in**: Tenant details

**Pros:**
- Persisted cycles with stable IDs
- Links payments to specific cycles via `cycle_id`

**Cons:**
- Requires gap detection to create missing cycles
- Slower due to database writes

**Flow:**
```
Query tenant → Detect gaps (create cycles) → Re-fetch with cycles → Calculate summary → Return
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `tenant-rent-summary.service.ts` | Core rent calculation, cycle generation |
| `tenant-status.service.ts` | Status flags, filtering logic |
| `rent-calculation.util.ts` | Prorated rent math |
| `tenant.service.ts` | `findAll()` (dynamic), `findOne()` (DB mode) |
| `dashboard.service.ts` | `getTenantStatusWidgets()` (dynamic) |

---

## Summary

1. **PAID**: Full payment for current cycle
2. **PARTIAL**: Some payment made, but still has remaining due
3. **NO_PAYMENT** (shown as PENDING): No payment for current cycle
4. **Total Due** = Partial Due + Pending Due
5. **A tenant appears in Partial tab if `partial_due_amount > 0`**
6. **A tenant appears in Pending tab if they have unpaid months AND `partial_due_amount === 0`**
