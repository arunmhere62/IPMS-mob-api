# Tenant Rent Payment Flow (Mobile)

This document explains the **rent payment entry flow** used by the Mobile app (`mob-ui`) and Mobile API (`mob-api`) for tenant rent payments, including:

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

## 2) Data Model Used

Table: `tenant_payments`

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

## 6) Partial Payments (Installments) — How to implement

### Goal
Allow multiple transactions for the **same rent period** without editing previous records.

### Recommended approach (already supported)
For a given period (`start_date`, `end_date`), create multiple `tenant_payments` rows:

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
