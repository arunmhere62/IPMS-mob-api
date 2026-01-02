# Tenant Rent Payment Flow (Mobile)

This document explains the **rent payment entry flow** used by the Mobile app (`mob-ui`) and Mobile API (`mob-api`) for tenant rent payments.

It is written for:

- backend developers working in `mob-api`
- frontend/mobile developers working in `mob-ui`
- anyone trying to understand how rent cycles, transfers, and partial payments behave

---

## TL;DR (Mental Model)

The system works best when you keep these responsibilities separate:

1) **Allocations (`tenant_allocations`) = where the tenant stayed + price history**
- Tracks bed/room/PG changes over time.
- Stores `bed_price_snapshot` so rent calculation stays accounting-safe even if prices change later.

2) **Rent cycles (periods) = derived from rules (not “invented” per payment)**
- A rent cycle is a computed date window (start/end) based on:
  - tenant check-in date
  - PG rent cycle type (`CALENDAR` vs `MIDMONTH`)
  - date math

3) **Payments (`rent_payments`) = money events**
- Each row is “money received”, possibly partial.
- Multiple payments can belong to the same cycle.

4) **Cycle summary = expected vs paid vs due**
- Compute expected rent from allocations.
- Compute paid total from payments.

One-line rule:

`Cycles group payments; payments should not define cycles.`

- Gap detection (`GET /tenant-payments/gaps/:tenant_id`)
- Suggested next payment dates (`GET /tenant-payments/next-dates/:tenant_id`)
- How to handle **partial payments** (installment payments)
- How to handle **partial month** (check-in month) periods
- How a gap is considered **closed**

---

## 1) Key Rules (Current Implementation)

- **Payments are immutable (no edit):**
  - `PATCH /tenant-payments/:id` returns `405 Method Not Allowed`.
  - If tenant pays in parts, create **multiple payment rows**, do not edit existing row.

- **Delete is allowed (soft delete):**
  - `DELETE /tenant-payments/:id` sets `is_deleted=true`.

- **Gap detection currently considers a gap “filled” if any payment exists** that overlaps the gap period and has `status` of `PAID` or `PARTIAL`.
  - **It does not validate amount totals**.

---

## 1.1) User-friendly flow (what the user does in the app)

When the user opens **Add Rent Payment** for a tenant:

1) App calls `GET /api/v1/tenant-payments/gaps/:tenant_id`
- If gaps exist, show “Missing Rent Period(s)” and let the user pick a period.

2) If user chooses “Continue (Skip gaps)”, app calls:
- `GET /api/v1/tenant-payments/next-dates/:tenant_id?rentCycleType=...&skipGaps=true`

3) App submits the payment:
- `POST /api/v1/tenant-payments`

4) Backend stores a new payment row (append-only).

---

## 1.2) Example scenarios (end-to-end)

### Example A: CALENDAR cycle, tenant joins mid-month

- Tenant check-in: `2025-12-10`
- Cycle type: `CALENDAR`

Computed cycle logic (ideal):

- Cycle for check-in month: `2025-12-10` -> `2025-12-31`
- Next cycle: `2026-01-01` -> `2026-01-31`

Payment behavior:

- Payment row(s) for Dec must map to the `2025-12-10` -> `2025-12-31` cycle.
- If tenant pays in 2 installments, create 2 rows with the same cycle window.

### Example B: MIDMONTH cycle, tenant joins on 10th

- Tenant check-in: `2025-12-10`
- Cycle type: `MIDMONTH`

Cycles:

- Cycle 1: `2025-12-10` -> `2026-01-09`
- Cycle 2: `2026-01-10` -> `2026-02-09`

Payment behavior:

- If tenant pays late (e.g., `2026-01-20`), the payment still belongs to Cycle 2 (Jan10–Feb09), not “a new random period”.

### Example C: Partial payment (installments) for the same cycle

Assume due for a cycle is `₹5000`.

- Payment 1: `₹2000`, status `PARTIAL`
- Payment 2: `₹1500`, status `PARTIAL`
- Payment 3: `₹1500`, status `PAID`

All three rows must belong to the same computed cycle window.

### Example D: Transfer within a cycle (allocation split)

- Tenant is in Bed A (₹6000/month) from `2025-12-01` to `2025-12-14`
- Tenant transfers to Bed B (₹9000/month) from `2025-12-15` onward
- Cycle type: `CALENDAR` (Dec = `2025-12-01` -> `2025-12-31`)

Expected rent is computed by splitting the cycle across allocations:

- Dec 1–14 at ₹6000/month (prorated)
- Dec 15–31 at ₹9000/month (prorated)

Payments remain simple “money events”; they don’t store split logic.

---

## 2) Data Model Used

Table: `rent_payments`

Important columns for rent flow:

- `tenant_id`
- `pg_id`
- `room_id`
- `bed_id`
- `start_date` / `end_date` (defines the rent period being paid for)
- `actual_rent_amount` (rent due for that period)
- `amount_paid` (amount received in this transaction)
- `status` (`PAID`, `PARTIAL`, `PENDING`, `FAILED`, `REFUNDED`)
- `is_deleted`

Related table: `tenant_allocations`

- `tenant_id`
- `pg_id`, `room_id`, `bed_id`
- `effective_from`, `effective_to`
- `bed_price_snapshot`

---

## 3) Relevant API Endpoints

### Create payment
- `POST /api/v1/tenant-payments`

Used by `mob-ui` when user taps **Add Payment**.

### Detect gaps
- `GET /api/v1/tenant-payments/gaps/:tenant_id`

Response (simplified):

```json
{
  "success": true,
  "data": {
    "hasGaps": true,
    "gapCount": 2,
    "gaps": [
      {
        "gapId": "gap_calendar_0",
        "gapStart": "2025-12-01",
        "gapEnd": "2025-12-31",
        "daysMissing": 31,
        "priority": -1,
        "isCheckInGap": true
      }
    ]
  }
}
```

### Suggest next payment dates
- `GET /api/v1/tenant-payments/next-dates/:tenant_id?rentCycleType=CALENDAR|MIDMONTH&skipGaps=true|false`

- If `skipGaps=false`:
  - If any gaps exist, it suggests the **earliest gap**.
  - If no gaps exist, it suggests the **next cycle** after last payment.
- If `skipGaps=true`:
  - It always suggests the **next cycle** after last payment (ignoring missing gaps).

---

## 3.1) What the backend should be responsible for (target behavior)

To keep the UX smooth and to avoid accounting bugs:

- The backend should be the **source of truth** for which cycle window a payment belongs to.
- UI can show suggestions, but it should not “invent” cycle boundaries.

Practical meaning:

- For `POST /tenant-payments`, the backend should compute the correct `start_date/end_date` for the tenant and cycle type.
- The API can still return `start_date/end_date` to display/group in UI.

---

## 4) Backend Gap Detection Logic

File:
- `mobile/mob-api/src/modules/tenant/tenant-payment/rent-payment.service.ts`
  - `detectPaymentGaps(tenant_id)`

### 4.1 Cycle Types
The cycle type is read from:
- `tenant.pg_locations.rent_cycle_type`

Supported values:
- `CALENDAR` (Month = 1st to last day)
- `MIDMONTH` (Cycle = tenant’s check-in day to same day next month - 1)

### 4.2 CALENDAR gap scanning
- Iterates from **check-in month** to **current month**.
- For each calendar month:
  - `monthStart = YYYY-MM-01`
  - `monthEnd = last day of YYYY-MM`
- A month is considered **paid/covered** if there exists any payment where:
  - `payment.start_date <= monthEnd`
  - `payment.end_date >= monthStart`
  - `payment.status in (PAID, PARTIAL)`

If no such payment exists, it emits a gap for that full month.

### 4.3 MIDMONTH gap scanning
- Starts cycles from **tenant.check_in_date**.
- Cycle is:
  - `cycleStart = currentCycleStart`
  - `cycleEnd = same day next month - 1 day`
- A cycle is considered **paid/covered** if there exists any payment where:
  - `payment.start_date <= cycleEnd`
  - `payment.end_date >= cycleStart`
  - `payment.status in (PAID, PARTIAL)`

If not, it emits a gap for that cycle.

---

## 4.4) Important note about “covered” vs “fully paid”

Today there are two concepts:

- **Covered (gap disappears)**: any payment overlaps the period with status `PAID`/`PARTIAL`.
- **Fully paid (accounting correct)**: `SUM(amount_paid)` for the cycle >= `actual_rent_amount` (or computed expected rent).

The “fully paid” rule is the correct accounting rule.
The “covered” rule is a UX shortcut.

---

## 5) Mobile UI Flow (RentPaymentForm)

File:
- `mobile/mob-ui/src/screens/tenants/RentPaymentForm.tsx`

### 5.1 When opening Add Payment
- Calls `GET /tenant-payments/gaps/:tenant_id`
- If gaps exist:
  - Shows a "Missing Rent Period(s)" warning list.
  - User can select a gap, and the form auto-fills:
    - `start_date = gap.gapStart`
    - `end_date = gap.gapEnd`

### 5.2 Continue to Next Payment (Skip gaps)
- Calls `GET /tenant-payments/next-dates/:tenant_id?rentCycleType=...&skipGaps=true`
- Auto-fills:
  - `start_date = suggestedStartDate`
  - `end_date = suggestedEndDate`

### 5.3 Period validation (important)
Current UI validation enforces:

- `CALENDAR`: must be **1st to last day of the same month**.
- `MIDMONTH`: must match **start day -> same day next month - 1** (with 1-day tolerance).

This means:
- **CALENDAR partial-month periods are currently blocked in UI.**

---

## 5.4) UX recommendation (to keep things simple)

The smoothest UI/UX happens when:

- UI asks backend for suggested cycle (`/gaps` or `/next-dates`).
- UI submits only money event info.
- Backend returns the final stored payment with computed cycle window.

---

## 6) Partial Payments (Installments) — How to implement

### Goal
Allow multiple transactions for the **same rent period** without editing previous records.

### Recommended approach (already supported)
For a given period (`start_date`, `end_date`), create multiple `rent_payments` rows:

- Payment 1: `amount_paid = 2000`, `status = PARTIAL`
- Payment 2: `amount_paid = 1500`, `status = PARTIAL`
- Payment 3: `amount_paid = 1500`, `status = PAID`

**Important:** All rows must have the same `start_date` and `end_date` so they are grouped to the same cycle.

### When is a period "fully paid"?
**Correct logic:**
- `totalPaid = SUM(amount_paid)` for that tenant + that exact period
- `rentDue = actual_rent_amount`
- Fully paid if `totalPaid >= rentDue`

**Current gap-detection limitation:**
- The backend marks a period “covered” if it finds **any** overlapping payment with `PAID` or `PARTIAL`.
- So if you create one small partial payment, the gap disappears even if totalPaid < rentDue.

**Recommended improvement (future):**
Change `detectPaymentGaps()` to check `SUM(amount_paid)` for that cycle and compare against `actual_rent_amount`.

---

## 7) Partial Month (Check-in Month) — What it should mean

### Why partial month is needed
If a tenant joins mid-month, the first rent period might not be a full calendar month.

Example:
- Tenant check-in: `2025-12-10`
- Calendar cycle normally expects: `2025-12-01` to `2025-12-31`
- But tenant should pay: `2025-12-10` to `2025-12-31` (partial month)

### Current state
- Backend `CALENDAR` gap detection produces full month gaps (1st -> last day).
- UI `CALENDAR` validation requires full month period.

### Recommended implementation for partial month (CALENDAR)
Use `isCheckInGap` from backend to allow a special rule:

- If gap is `isCheckInGap=true`:
  - Set `gapStart = tenant.check_in_date` (not the 1st)
  - Set `gapEnd = last day of that month`

Then in UI validation:
- Allow a CALENDAR period that starts on check-in day **only for the check-in month**.

### MIDMONTH partial month
For `MIDMONTH`, the first cycle already starts from the check-in day, so it naturally supports partial month behavior.

---

## 8) How to “Close” a Gap

### Current system definition
A gap from `gapStart` to `gapEnd` is considered closed when:
- There exists at least one payment overlapping that period with `status` in `PAID` or `PARTIAL`.

So to close a gap:
1. Select the gap in the UI.
2. Create a payment with:
   - `start_date = gapStart`
   - `end_date = gapEnd`
   - `amount_paid` set by user
   - `status` auto-suggested:
     - `PAID` if `amount_paid >= actual_rent_amount`
     - `PARTIAL` if `0 < amount_paid < actual_rent_amount`

### Closing with installments
If tenant pays in installments for the same gap:
- Create multiple payments with the same `start_date/end_date`.

**Note:** With the current backend, the gap will disappear as soon as the first PARTIAL payment is added.
If you want the gap to disappear only when fully paid, implement the recommended improvement in section 6.

---

## 9) Deleting payments (Allowed)

- UI exposes delete using `DELETE /tenant-payments/:id`.
- Backend performs soft delete (`is_deleted=true`).

Impact on gaps:
- Deleted payments are excluded from gap detection.
- So deleting a payment can re-create gaps.

---

## 10) Known Issues / Mismatches

1) **`updateStatus` allowed statuses mismatch**
- `updateStatus()` currently validates against `PENDING, PAID, OVERDUE, CANCELLED`.
- Prisma enum is `PAID, PENDING, FAILED, REFUNDED, PARTIAL`.

2) **Gap detection ignores payment totals**
- Any PARTIAL payment closes a gap.

3) **CALENDAR partial month unsupported**
- UI validation blocks it.
- Backend generates full-month check-in gap.

---

## 12) Glossary

- **Cycle / Rent period**: a computed date window like `2025-12-10` -> `2025-12-31`.
- **Allocation**: where the tenant stayed during a range of dates, including a price snapshot.
- **Payment event**: one money transaction row (append-only).
- **Installment**: multiple payment events that belong to the same cycle.

---

## 11) Recommended Next Steps (If you want strict correctness)

- **(A) Implement check-in month partial period for CALENDAR**
  - Backend: generate check-in month gap as `check_in_date -> monthEnd`.
  - UI: allow this special period when `gap.isCheckInGap=true`.

- **(B) Make gap closure depend on payment totals**
  - Compute per-cycle totals for `amount_paid`.
  - Compare to `actual_rent_amount`.

- **(C) Keep installments append-only**
  - No edits.
  - Allow delete as soft delete.

---

## References

- Backend:
  - `mobile/mob-api/src/modules/tenant/tenant-payment/rent-payment.controller.ts`
  - `mobile/mob-api/src/modules/tenant/tenant-payment/rent-payment.service.ts`

- Mobile UI:
  - `mobile/mob-ui/src/screens/tenants/RentPaymentForm.tsx`
  - `mobile/mob-ui/src/services/api/paymentsApi.ts`
