# 💰 Rent Cycles & Tenant Allocations

> **Comprehensive Guide:** How rent cycles work, how they're created, and how tenant allocations manage rent calculations

---

## 📋 What is a Rent Cycle?

A **Rent Cycle** defines the time period for which rent is calculated and collected. The system supports two cycle types:

- 📅 **CALENDAR** - Standard monthly billing (1st to last day of month)
- 📆 **MIDMONTH** - Custom date range based on tenant's check-in day

Each tenant has their own set of rent cycles stored in `tenant_rent_cycles` table, which are automatically generated from their check-in date up to the current date.

---

## 🔄 Rent Cycle Types Explained

### 📅 CALENDAR Cycle (Default)

**How It Works:**
```
Rent is calculated from the 1st day of each month to the last day of that month

Example Timeline:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

January 2026          February 2026         March 2026
├─ Jan 1 to Jan 31 ─┼─ Feb 1 to Feb 28 ─┼─ Mar 1 to Mar 31 ─┤
        ↓                    ↓                    ↓
    Rent Due: ₹8000      Rent Due: ₹8000      Rent Due: ₹8000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Key Characteristics:**
- **First Month (Check-in Month):** Prorated from check-in day to month-end
- **Subsequent Months:** Full month from 1st to last day
- **Simple:** Easy to understand, standard monthly billing
- **Common Use:** Most PGs use this for simplicity

**Example Calculation:**
```
Tenant checks in on January 15, 2026
Bed Price: ₹8000/month

January Rent (Prorated):
- Days in January: 31 days
- Days occupied: Jan 15 to Jan 31 = 17 days
- Rent = (8000 / 31) × 17 = ₹4,387.10

February Rent (Full):
- Feb 1 to Feb 28 = 28 days
- Rent = ₹8,000 (full month)
```

---

### 📆 MIDMONTH Cycle

**How It Works:**
```
Rent is calculated based on the tenant's check-in day as an "anchor"
Each cycle runs from anchor day of current month to (anchor day - 1) of next month

Example Timeline (Anchor = 15th):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cycle 1: Jan 15 to Feb 14    Cycle 2: Feb 15 to Mar 14    Cycle 3: Mar 15 to Apr 14
├──────── Jan 15-31 ─┼─ Feb 1-14 ─┼├─ Feb 15-28 ─┼├─ Mar 1-14 ─┼├─ Mar 15-31 ─┼─ Apr 1-14 ─┤
       ↓                                     ↓                                     ↓
   Rent Due: ₹8000                      Rent Due: ₹8000                      Rent Due: ₹8000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Key Characteristics:**
- **Anchor Day:** The day of month when tenant checked in (e.g., 15th)
- **No Proration:** Full bed price charged every cycle (simpler for tenants)
- **Consistent:** Same amount every billing period
- **Common Use:** When tenants move in mid-month and you want consistent billing

**Example Calculation:**
```
Tenant checks in on January 15, 2026
Anchor Day: 15th
Bed Price: ₹8000/month

Cycle 1 (Jan 15 to Feb 14):
- Days: 31 days (Jan 15-31 = 17 days + Feb 1-14 = 14 days)
- Rent = ₹8,000 (full price, no proration)

Cycle 2 (Feb 15 to Mar 14):
- Days: 28 days (Feb 15-28 = 14 days + Mar 1-14 = 14 days)
- Rent = ₹8,000 (full price, no proration)

Note: MIDMONTH always uses full bed price, regardless of days in cycle
```

---

## ⚙️ How Rent Cycles Are Created

### Automatic Cycle Creation Process

**When Are Cycles Created?**

1. **On Tenant Registration** - Initial cycles created from check-in date to today
2. **Daily Cron Job** - Creates missing cycles for all active tenants up to current date
3. **Manual Trigger** - Admin can generate missing cycles for specific tenant or all tenants

**Creation Algorithm:**
```
1. Get tenant's check-in date
2. Determine cycle type (CALENDAR or MIDMONTH from PG settings)
3. Set anchor day:
   - CALENDAR: Always 1st of month
   - MIDMONTH: Tenant's check-in day
4. Compute cycles from check-in date to today (IST timezone)
5. For each cycle, calculate:
   - cycle_start: Start date of the cycle
   - cycle_end: End date of the cycle
   - cycle_type: CALENDAR or MIDMONTH
   - anchor_day: The anchor day for this cycle
6. Save to tenant_rent_cycles table (skip duplicates)
```

### CALENDAR Cycle Computation

```typescript
// For check-in month:
If (referenceMonth === checkInMonth) {
  cycle_start = checkInDate          // e.g., Jan 15
  cycle_end = lastDayOfMonth         // e.g., Jan 31
}

// For subsequent months:
Else {
  cycle_start = 1st day of month     // e.g., Feb 1
  cycle_end = lastDayOfMonth         // e.g., Feb 28
}
```

### MIDMONTH Cycle Computation

```typescript
// Anchor day = tenant's check-in day (e.g., 15th)

// Determine which logical month:
If (today's day >= anchorDay) {
  cycle starts THIS month
} Else {
  cycle started LAST month
}

// Calculate dates:
cycle_start = anchorDay of startMonth     // e.g., Jan 15
cycle_end = (anchorDay of nextMonth) - 1 // e.g., Feb 14

// Handle short months (e.g., anchor=31 in Feb):
If (anchorDay > daysInMonth) {
  use lastDayOfMonth instead
}
```

### Example: Complete Cycle Generation

**Scenario:** Tenant checks in on January 15, 2026, today is March 20, 2026

**For CALENDAR Type:**
```
Cycle 1: Jan 15, 2026 to Jan 31, 2026 (prorated period)
Cycle 2: Feb 1, 2026 to Feb 28, 2026 (full month)
Cycle 3: Mar 1, 2026 to Mar 31, 2026 (full month - current cycle)
```

**For MIDMONTH Type (Anchor = 15th):**
```
Cycle 1: Jan 15, 2026 to Feb 14, 2026
Cycle 2: Feb 15, 2026 to Mar 14, 2026
Cycle 3: Mar 15, 2026 to Apr 14, 2026 (current cycle starts Mar 15)
```

---

## 🏠 What is Tenant Allocation?

**Tenant Allocation** tracks where a tenant has stayed over time and what rent price applied during each period.

### Why Allocations Matter

- 📍 **Location History:** Tracks when tenant moved between PGs/Rooms/Beds
- 💰 **Price History:** Stores bed price snapshot at time of allocation
- 🧮 **Rent Calculation:** Determines which price to use for which period
- 🔄 **Transfer Support:** Enables tenant transfers with accurate billing

### Allocation Record Structure

Each allocation record contains:
- **tenant_id** - Reference to the tenant
- **pg_id** - Which PG location
- **room_id** - Which room
- **bed_id** - Which bed
- **effective_from** - Start date of this allocation
- **effective_to** - End date (null if currently active)
- **bed_price_snapshot** - The rent price at time of allocation

---

## 🔄 How Tenant Allocations Work

### Initial Allocation (On Tenant Registration)

**When a tenant is registered:**
```
1. Tenant record created with check_in_date
2. Initial allocation record created:
   - effective_from = check_in_date
   - effective_to = null (ongoing)
   - bed_price_snapshot = current bed price
   - pg_id, room_id, bed_id = assigned location
3. Rent cycles generated from check-in date
```

**Example:**
```
Tenant: Rajesh Kumar
Check-in: January 15, 2026
Assigned: Green Valley PG → Room 101 → Bed BED1
Bed Price: ₹8000

Allocation Record Created:
┌─────────────────────────────────────────┐
│ tenant_id: 123                         │
│ pg_id: 5                               │
│ room_id: 12                            │
│ bed_id: 45                             │
│ effective_from: 2026-01-15              │
│ effective_to: null                     │
│ bed_price_snapshot: 8000.00           │
└─────────────────────────────────────────┘
```

---

### Transfer Allocation (When Tenant Moves)

**When a tenant is transferred:**
```
1. Close previous allocation:
   - Set effective_to = day before transfer effective date

2. Create new allocation:
   - effective_from = transfer effective date
   - effective_to = null
   - bed_price_snapshot = new bed's current price
   - pg_id, room_id, bed_id = new location

3. Validate: Only one transfer allowed per rent cycle
```

**Example:**
```
Initial State (Before Transfer):
┌─────────────────────────────────────────┐
│ effective_from: 2026-01-15             │
│ effective_to: null                     │ ← Currently active
│ bed_price: ₹8000                       │
│ Location: Room 101, Bed 1              │
└─────────────────────────────────────────┘

Transfer on March 1, 2026 to Room 102, Bed 2 (Price: ₹7500)

After Transfer:
Previous Allocation:
┌─────────────────────────────────────────┐
│ effective_from: 2026-01-15             │
│ effective_to: 2026-02-28               │ ← Closed
│ bed_price: ₹8000                       │
└─────────────────────────────────────────┘

New Allocation:
┌─────────────────────────────────────────┐
│ effective_from: 2026-03-01             │ ← New active
│ effective_to: null                     │
│ bed_price: ₹7500                       │
│ Location: Room 102, Bed 2              │
└─────────────────────────────────────────┘
```

---

## 🧮 How Rent is Calculated Using Cycles & Allocations

### Rent Calculation Flow

```
1. Determine current rent cycle from tenant_rent_cycles
2. Get cycle period (cycle_start to cycle_end)
3. Find allocations overlapping this period
4. Calculate rent based on cycle type:
   
   CALENDAR → Use proration based on days in calendar month
   MIDMONTH → Use full bed price from allocation
```

### CALENDAR Rent Calculation (With Proration)

**Formula:**
```
For each day in the cycle:
  1. Find active allocation for that day
  2. Get bed price from allocation
  3. Calculate: (bed_price / days_in_month) × days_in_segment
  4. Sum all segments
```

**Example with Transfer:**
```
Cycle: March 1 to March 31, 2026
Allocations:
- Mar 1-14: Allocation A (Bed 1, ₹8000)  
- Mar 15-31: Allocation B (Bed 2, ₹7500) [transferred on Mar 15]

Rent Calculation:
Segment 1 (Mar 1-14):
- Days: 14
- Days in March: 31
- Price: ₹8000
- Rent = (8000 / 31) × 14 = ₹3,612.90

Segment 2 (Mar 15-31):
- Days: 17
- Days in March: 31
- Price: ₹7500
- Rent = (7500 / 31) × 17 = ₹4,112.90

Total March Rent: ₹3,612.90 + ₹4,112.90 = ₹7,725.81
```

---

### MIDMONTH Rent Calculation (No Proration)

**Formula:**
```
Find the latest allocation for the cycle
Rent = bed_price_snapshot from that allocation
(No proration - full price always charged)
```

**Example with Transfer:**
```
Cycle: March 15 to April 14, 2026
Tenant transferred on March 20

Allocations:
- Mar 15-19: Allocation A (Bed 1, ₹8000)
- Mar 20 onwards: Allocation B (Bed 2, ₹7500)

Rent Calculation:
- Latest allocation in cycle: Allocation B (₹7500)
- Rent = ₹7,500 (full price, regardless of transfer date)

Note: Even though tenant only spent 5 days on Bed 1 and 
26 days on Bed 2, full ₹7500 is charged for the entire cycle.
```

---

## 📊 Database Tables

### tenant_rent_cycles Table

Stores all rent cycles for each tenant.

**Core Columns:**
- `s_no` (INT, PK) - Unique identifier for the cycle record
- `tenant_id` (INT, FK) - Reference to the tenant
- `cycle_type` (ENUM) - CALENDAR or MIDMONTH
- `anchor_day` (INT) - The anchor day (1 for CALENDAR, check-in day for MIDMONTH)
- `cycle_start` (DATE) - Start date of the cycle
- `cycle_end` (DATE) - End date of the cycle

**Constraints:**
- Unique constraint on `(tenant_id, cycle_start)` - prevents duplicate cycles

---

### tenant_allocations Table

Tracks tenant's bed assignments over time.

**Core Columns:**
- `s_no` (INT, PK) - Unique identifier for the allocation
- `tenant_id` (INT, FK) - Reference to the tenant
- `pg_id` (INT, FK) - PG location reference
- `room_id` (INT, FK) - Room reference
- `bed_id` (INT, FK) - Bed reference
- `effective_from` (DATE) - Start date of this allocation
- `effective_to` (DATE, nullable) - End date (null if currently active)
- `bed_price_snapshot` (DECIMAL) - Bed price at time of allocation

**Business Rules:**
- Only one allocation can be active (effective_to = null) at a time
- On transfer, previous allocation is closed (effective_to set)
- New allocation is created with effective_from = transfer date

---

## 🔒 Key Business Rules

### Rent Cycle Creation Rules

- **Idempotent Creation:** Can be called multiple times safely - duplicates are skipped
- **IST Timezone:** All calculations use Indian Standard Time (UTC+5:30)
- **Check-in Date:** Cycles are never created before tenant's check-in date
- **Future Cycles:** Cycles are only created up to current date, not future dates
- **Overlap Protection:** Existing cycles are checked to prevent overlapping periods

### Tenant Allocation Rules

- **One Active Allocation:** Only one allocation can have `effective_to = null` at a time
- **Transfer Once Per Cycle:** Tenants can only be transferred once per rent cycle
- **Effective Date Validation:** Transfer effective date cannot be before check-in date
- **Date Continuity:** New allocation's effective_from must be after previous allocation's effective_from
- **Price Snapshot:** Bed price is captured at allocation time for historical accuracy

### Rent Calculation Rules

- **CALENDAR Proration:** Rent is prorated based on calendar month days
- **MIDMONTH Full Price:** Full bed price charged regardless of days in cycle
- **Allocation-Based:** Rent uses the price from the allocation active during that period
- **Transfer Handling:** When transfer occurs mid-cycle, rent is calculated based on appropriate allocation

---

## 🎯 Common Scenarios

### Scenario 1: New Tenant Registration

```
1. Owner registers tenant with check-in date = Jan 15, 2026
2. System creates tenant record
3. System creates initial allocation (effective_from = Jan 15)
4. System generates rent cycles:
   - Jan 15 to Jan 31 (first cycle - prorated)
   - Feb 1 to Feb 28
   - Mar 1 to Mar 31
   - ... up to today
5. Rent calculations use these cycles going forward
```

### Scenario 2: Tenant Transfer Within Same PG

```
1. Tenant is in Room 101, Bed 1 (₹8000) since Jan 15
2. Owner transfers tenant to Room 102, Bed 2 (₹7500) effective Mar 1
3. System actions:
   - Close current allocation: effective_to = Feb 28
   - Create new allocation: effective_from = Mar 1, price = ₹7500
   - Note: One transfer already used for Mar cycle
4. March rent calculation:
   - CALENDAR: Prorated based on days with new price
   - MIDMONTH: Full ₹7500 charged
```

### Scenario 3: Rent Payment Collection

```
1. System identifies current rent cycle for tenant
2. Determines expected rent based on:
   - Cycle type (CALENDAR/MIDMONTH)
   - Active allocation's bed price
   - Any transfers within the cycle
3. Checks existing payments for the cycle
4. Calculates due amount:
   - Expected rent - Payments made = Due amount
5. Displays to owner for collection
```

---

## 📁 Key Files Reference

**Frontend Layer:**
- `src/features/owner/screens/tenants/TenantRentPaymentsScreen.tsx` - Rent payment collection UI
- `src/features/owner/screens/tenants/TenantDetailsScreen.tsx` - Tenant rent summary display
- `src/features/owner/screens/tenants/RentPaymentForm.tsx` - Rent payment entry form

**Backend Services:**
- `src/modules/common/rent-cycle-calculator.service.ts` - Date calculations for cycles
- `src/modules/common/rent-cycle-creation.service.ts` - Creates rent cycle records
- `src/modules/tenant/rent-calculation.util.ts` - Rent amount calculations
- `src/modules/tenant/tenant-payment/rent-payment.service.ts` - Payment processing
- `src/modules/tenant/tenant-rent-summary.service.ts` - Rent summary generation

**Database:**
- `prisma/schema.prisma` (tenant_rent_cycles model) - Rent cycle table structure
- `prisma/schema.prisma` (tenant_allocations model) - Allocation table structure

---

## 📞 Common Questions

**Q: What happens if a tenant checks in on the 31st and cycle is MIDMONTH?**
A: The system handles short months by clamping the date. For example, if anchor is 31st:
- Jan 31 to Feb 27 (Feb only has 28 days)
- Mar 31 to Apr 29 (Apr has 30 days)
The cycle adjusts to the last valid day of each month.

**Q: Can I change a PG's rent cycle type after tenants are registered?**
A: ❌ No. Once rent payments exist, the rent cycle type cannot be changed. This ensures billing consistency.

**Q: How does the system handle leap years in CALENDAR cycles?**
A: The system uses JavaScript Date objects which automatically handle leap years. February will have 29 days in leap years, and proration calculations will use the correct day count.

**Q: What happens to rent cycles when a tenant checks out?**
A: No new cycles are created after checkout date. Existing cycles up to checkout date remain for payment history.

**Q: Can a tenant have multiple allocations in one rent cycle?**
A: ✅ Yes, if they transferred within the cycle. The rent calculation will use the appropriate allocation's price for each day/period.

**Q: Why is MIDMONTH rent always full price even if tenant stayed fewer days?**
A: MIDMONTH is designed for consistent, predictable billing. Tenants pay the same amount each cycle regardless of exact days, making budgeting easier.

**Q: How are rent cycles created automatically?**
A: A daily cron job runs at midnight IST to create missing cycles for all active tenants up to the current date.

---

*Document Version: 1.0*  
*Last Updated: June 2026*
