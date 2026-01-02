# Tenant Allocation / Rent Cycle / Rent Payment Flow

This document explains the **data model**, **backend API flow**, and **mobile UI flow** for these Prisma models:

- `tenant_allocations`
- `tenant_rent_cycles`
- `rent_payments`

It is written to help you debug issues like **wrong cycle dates**, **transfer effective date drift**, and **why payments map to a given rent cycle**.

---

## 1) Data Model (Prisma)

### 1.1 `tenant_allocations`
**Purpose**
- Stores the tenant’s **bed/room/PG allocation history over time**.
- Needed for:
  - tracking transfers
  - calculating rent due correctly when bed price changes mid-cycle
  - producing “Transfer History” in UI

**Key fields**
- `tenant_id`, `pg_id`, `room_id`, `bed_id`
- `effective_from` (DateTime)
- `effective_to` (DateTime?, nullable means “current allocation”)
- `bed_price_snapshot` (Decimal)

**Important constraints**
- `@@unique([tenant_id, effective_from])`
  - one tenant cannot have two allocations starting the same day.

**Lifecycle**
- When a tenant is created and has a bed:
  - initial allocation row should be created with `effective_from = check_in_date (date-only)`.
- When tenant is transferred:
  - previous open allocation is closed (`effective_to = day_before_new_effective_from`)
  - new allocation is created with `effective_from = transfer effective date`

---

### 1.2 `tenant_rent_cycles`
**Purpose**
- Stores **tenant-specific rent cycle windows** (cycle start/end).
- Used to attach each `rent_payment` to a cycle via `rent_payments.cycle_id`.
- Lets the backend compute “cycle summaries” and payment status.

**Key fields**
- `tenant_id`
- `cycle_type` (string, ex: `CALENDAR` or `MIDMONTH`)
- `anchor_day` (int)
- `cycle_start`, `cycle_end`

**Important constraints**
- `@@unique([tenant_id, cycle_start])`
  - only one cycle per tenant per start date.

**How cycles are created**
- Cycles are upserted when creating a rent payment if `cycle_id` is not supplied.
- Source of truth for cycle computation is:
  - `TenantPaymentService.computeCycleWindow()`

**Current cycle rules (as implemented)**
- `CALENDAR`
  - cycle is month-based
  - special-case: check-in month may start at tenant check-in date instead of 1st
- `MIDMONTH`
  - anchored to **tenant check-in day** (`anchor_day = day(check_in_date)`)
  - current cycle starts on anchor day of this month if `referenceDate >= anchor_day`, else previous month
  - cycle end = next cycle start - 1 day

---

### 1.3 `rent_payments`
**Purpose**
- Stores rent payments made by tenants.
- Each payment optionally links to:
  - `tenant_rent_cycles` via `cycle_id`

**Key fields**
- `tenant_id`, `pg_id`, `room_id`, `bed_id`
- `cycle_id` (nullable)
- `payment_date` (DateTime?)
- `amount_paid`, `actual_rent_amount`
- `status`, `payment_method`, `remarks`
- `is_deleted` (soft delete)

**Relations**
- `rent_payments.tenant_rent_cycles` is a relation to `tenant_rent_cycles` by `cycle_id`.

---

## 2) Backend API Flow (mob-api)

### 2.1 Fetch tenant details (includes allocations + cycles + payments)
**Endpoint**
- `GET /api/v1/tenants/:id`

**Controller**
- `TenantController.findOne()`

**Service**
- `TenantService.findOne(id)`

**What it returns (relevant parts)**
- tenant core fields
- `tenant_allocations` (history)
- `tenant_rent_cycles` (cycle windows)
- `rent_payments` (payment list, joined with cycle info)
- computed/enriched fields such as:
  - `payment_cycle_summaries`
  - `unpaid_months`
  - flags: `is_rent_paid`, `is_rent_partial`, etc.

---

### 2.2 Transfer tenant (creates allocation row)
**Endpoint**
- `POST /api/v1/tenants/:id/transfer`

**Client payload**
```json
{
  "to_pg_id": 2,
  "to_room_id": 10,
  "to_bed_id": 99,
  "effective_from": "2026-01-15"
}
```

**Controller**
- `TenantController.transferTenant()`

**Service**
- `TenantService.transferTenant(tenantId, dto)`

**Validation & business rules**
- Tenant must exist and be `ACTIVE`
- `effective_from` must be valid and `>= check_in_date`
- Only one transfer per rent cycle (checked via `tenant_allocations` rows in the computed cycle window)
- Target PG/room/bed must exist
- Target bed must not be occupied by another ACTIVE tenant

**Persistence**
- Transaction:
  - close previous allocation: set `effective_to = dayBefore(effective_from)`
  - create new allocation with:
    - `effective_from = effective_from (date-only)`
    - `bed_price_snapshot = bed.bed_price`
  - update `tenants.pg_id/room_id/bed_id`

**Important date handling**
- `effective_from` should be treated as **date-only**.
- Backend should parse it as `YYYY-MM-DD` and store as UTC midnight to avoid timezone drift.

---

### 2.3 Create rent payment (upserts tenant cycle + creates rent payment)
**Endpoint**
- `POST /api/v1/rent-payments`

**Controller**
- `TenantPaymentController.create()`
  - forces `pg_id` from request headers

**Service**
- `TenantPaymentService.create(createTenantPaymentDto)`

**Validation & business rules**
- Tenant exists
- **Checked-out tenants cannot receive rent payments**
- Room and bed exist
- `amount_paid <= actual_rent_amount`

**Cycle behavior**
- If client provides `cycle_id`:
  - service validates that it belongs to the tenant
- Else:
  - service computes cycle window (CALENDAR / MIDMONTH)
  - service `upsertTenantCycle()` using unique `(tenant_id, cycle_start)`
  - returned cycle `s_no` is used as `rent_payments.cycle_id`

**Persistence**
- `rent_payments.create({ data: { ..., cycle_id, payment_date, ... } })`

---

### 2.4 Delete rent payment (soft delete)
**Endpoint**
- `DELETE /api/v1/rent-payments/:id`

**Controller**
- `TenantPaymentController.remove()`

**Service**
- `TenantPaymentService.remove(id)`

---

## 3) Mobile UI Flow (mob-ui)

### 3.1 Tenant Details Screen (hub)
**Screen**
- `mobile/mob-ui/src/screens/tenants/TenantDetailsScreen.tsx`

**Data fetch**
- `useGetTenantByIdQuery(tenantId)`
  - calls `GET /tenants/:id`
  - response includes allocations, cycles, payments, and computed summaries

**Shows**
- Transfer history from `tenant.tenant_allocations`
- Payment summaries from `tenant.payment_cycle_summaries`
- Buttons:
  - Checkout
  - Transfer
  - Add Rent / Advance / Refund

---

### 3.2 Transfer flow (UI)
**Where**
- Transfer modal inside `TenantDetailsScreen.tsx`

**State**
- `transferPgId`, `transferRoomId`, `transferBedId`
- `transferEffectiveFrom` (string `YYYY-MM-DD`)

**User steps**
1. Tap `Transfer`
2. Select PG → Room → Bed
3. Pick `Effective From` date
4. Tap `Confirm Transfer`

**API call**
- `useTransferTenantMutation()` from `tenantsApi`
- calls:
  - `POST /tenants/:id/transfer`

**Important**
- UI uses a date-only string contract (`YYYY-MM-DD`).
- Avoid constructing JS `Date` from `YYYY-MM-DD` via `new Date('YYYY-MM-DD')` for min/max, because it is UTC-parsed.

---

### 3.3 Rent payment flow (UI)
**Where**
- `RentPaymentForm` opened from Tenant Details

**API call**
- `useCreateTenantPaymentMutation()` from `paymentsApi`
- calls:
  - `POST /rent-payments`

**What UI sends (typical)**
- `tenant_id`, `pg_id`, `room_id`, `bed_id`
- `amount_paid`, `actual_rent_amount`
- `payment_date` (date-only string or ISO depending on UI)
- `cycle_id` (optional)

**Backend outcome**
- If `cycle_id` omitted, backend creates/updates a `tenant_rent_cycles` row and attaches payment to it.

---

## 4) Common Debug Checklist

### A) “Transfer effective_from stored wrong day/month”
- Ensure frontend sends `YYYY-MM-DD`
- Ensure backend parses it as **date-only** and stores UTC midnight

### B) “Cycle dates look wrong / extra cycles exist”
- Check `TenantPaymentService.computeCycleWindow()`
- Check if client is sending `cycle_id` manually (if so, that cycle must match the intended window)

### C) “Rent due differs after transfer”
- Due calculations may use `tenant_allocations.bed_price_snapshot` prorated across the cycle.
- Verify allocation rows overlap the cycle period correctly.

---

## 5) Key Files

### Backend
- `src/modules/tenant/tenant.controller.ts`
- `src/modules/tenant/tenant.service.ts`
- `src/modules/tenant/tenant-payment/rent-payment.controller.ts`
- `src/modules/tenant/tenant-payment/rent-payment.service.ts`
- `prisma/schema.prisma`

### Frontend
- `mob-ui/src/screens/tenants/TenantDetailsScreen.tsx`
- `mob-ui/src/services/api/tenantsApi.ts`
- `mob-ui/src/services/api/paymentsApi.ts`
- `mob-ui/src/components/DatePicker.tsx`
