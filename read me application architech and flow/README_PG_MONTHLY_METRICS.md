# PG Monthly Metrics (This Month)

This doc explains how to identify, **per PG (`pg_id`)**:

- **This month rent received** (cash collected)
- **This month refunds paid** (cash out)
- **This month PG value** as **MRR** (monthly recurring rent expected from active allocations)

It also shows how to pick the correct date window, and provides an end-to-end example.

---

## 1) Pick the month window

Use an **inclusive start** and **exclusive end** window:

- `monthStart` = first day of the month at `00:00:00`
- `monthEnd` = first day of next month at `00:00:00`

Example for **January 2026**:

- `monthStart = '2026-01-01 00:00:00'`
- `monthEnd   = '2026-02-01 00:00:00'`

Why exclusive end? It avoids edge cases (midnight boundaries) and works consistently.

---

## 1A) The 3 numbers to understand (Cash vs Earned vs MRR)

For any month, there are 3 different “truths”:

1) **Cash Received**

- Money movement
- Based only on `rent_payments.payment_date`

2) **Rent Earned**

- Actual income for the month (used for profit)
- Based on how many days the tenant stayed inside the month window
- Depends on rent cycle type (Calendar vs Midmonth)

3) **MRR / PG Value**

- Business capacity
- Based on active allocations (`tenant_allocations`) overlapping the month

### Worked example A (Calendar cycle)

Month: **January 2026**

- `monthStart = Jan 1`
- `monthEnd   = Feb 1`

Tenants (same PG):

| Tenant | Bed Price | Join Date | Cycle Type |
|-------:|----------:|----------:|-----------:|
| A      | 5000      | Dec 1     | Calendar   |
| B      | 6000      | Jan 10    | Calendar   |
| C      | 4000      | Jan 20    | Calendar   |

Payments (cash):

| Tenant | Amount | Payment Date |
|-------:|------:|-------------:|
| A      | 5000   | Jan 1        |
| B      | 6000   | Feb 1        |
| C      | 2000   | Jan 25       |

Cash Received (Jan):

- A counts (paid in Jan)
- B does not count (paid on `Feb 1`, and `monthEnd` is exclusive)
- C counts (paid in Jan)

Total Cash Received (Jan) = `5000 + 2000 = 7000`

Rent Earned (Jan) for Calendar cycle tenants:

- January has 31 days
- Earned amount is prorated by calendar-month days stayed in Jan

Tenant A: full month → `5000`

Tenant B: stayed `Jan 10 → Jan 31` = 22 days

- Earned ≈ `6000 / 31 * 22 = 4258.06`

Tenant C: stayed `Jan 20 → Jan 31` = 12 days

- Earned ≈ `4000 / 31 * 12 = 1548.39`

Total Rent Earned (Jan) ≈ `5000 + 4258.06 + 1548.39 = 10806.45`

MRR / PG Value (Jan):

- Sum of monthly prices for active allocations in Jan (no proration)
- Total MRR = `5000 + 6000 + 4000 = 15000`

### Worked example B (Midmonth cycle)

Month: **January 2026**

- `monthStart = Jan 1`
- `monthEnd   = Feb 1`

Two tenants (same PG) with different midmonth cycles:

Tenant D:

- Cycle: `2026-01-04 → 2026-02-03`
- Monthly rent for that cycle: `5000`

Tenant E:

- Cycle: `2026-01-15 → 2026-02-14`
- Monthly rent for that cycle: `6000`

Cash Received (Jan):

- If payment date is inside Jan, it counts (same rule as Calendar)

Rent Earned (Jan) for Midmonth cycle tenants:

- Earned amount is prorated by **cycle length**, not “days in January”
- General formula:

```
earned_in_month = cycle_rent_amount * (overlap_days(month, cycle) / total_days(cycle))
```

For Jan 2026:

- Tenant D overlaps Jan from `Jan 4 → Feb 1`
- Tenant E overlaps Jan from `Jan 15 → Feb 1`

Both contribute to January earned rent (even if paid in Feb), but only the overlapped portion.

MRR / PG Value (Jan):

- Same rule: sum of active allocation prices overlapping the month

---

## 2) Rent received per PG this month (cash in)

### What it means
Sum of all rent payments **actually received** in the month.

- Uses `rent_payments.payment_date`
- Counts payments with `status IN ('PAID','PARTIAL')`
- Ignores soft-deleted rows

### SQL
```sql
SELECT rp.pg_id,
       SUM(CAST(rp.amount_paid AS DECIMAL(10,2))) AS rent_received
FROM rent_payments rp
WHERE rp.payment_date >= :monthStart
  AND rp.payment_date <  :monthEnd
  AND rp.status IN ('PAID','PARTIAL')
  AND (rp.is_deleted = 0 OR rp.is_deleted IS NULL)
GROUP BY rp.pg_id;
```

### Example output
| pg_id | rent_received |
|------:|--------------:|
| 3     | 7551.84       |
| 5     | 12000.00      |

---

## 3) Refunds paid per PG this month (cash out)

### What it means
Sum of refund payments **paid out** in the month.

- Uses `refund_payments.payment_date`
- Ignores soft-deleted rows

### SQL
```sql
SELECT rf.pg_id,
       SUM(CAST(rf.amount_paid AS DECIMAL(10,2))) AS refunds_paid
FROM refund_payments rf
WHERE rf.payment_date >= :monthStart
  AND rf.payment_date <  :monthEnd
  AND (rf.is_deleted = 0 OR rf.is_deleted IS NULL)
GROUP BY rf.pg_id;
```

### Example output
| pg_id | refunds_paid |
|------:|-------------:|
| 3     | 500.00       |
| 5     | 0.00         |

---

## 4) PG value this month = MRR from allocations

### What it means
A practical definition of “PG value” (operational value) is **MRR**:

- Sum of **active allocation prices** for this month
- Uses `tenant_allocations.bed_price_snapshot`
- Only counts tenants where `tenants.status = 'ACTIVE'`

### Why allocation snapshot?
Rent can change over time. `bed_price_snapshot` is the price captured when the tenant was allocated.

### SQL
```sql
SELECT ta.pg_id,
       SUM(CAST(ta.bed_price_snapshot AS DECIMAL(10,2))) AS mrr_value
FROM tenant_allocations ta
JOIN tenants t ON t.s_no = ta.tenant_id
WHERE t.status = 'ACTIVE'
  AND ta.effective_from < :monthEnd
  AND (ta.effective_to IS NULL OR ta.effective_to >= :monthStart)
GROUP BY ta.pg_id;
```

### Example output
| pg_id | mrr_value |
|------:|----------:|
| 3     | 15000.00  |
| 5     | 30000.00  |

---

## 5) Putting it together (per PG)

Once you have:

- `rent_received`
- `refunds_paid`
- `mrr_value`

You can compute a simple **cash profit before expenses**:

```
cash_profit_before_expenses = rent_received - refunds_paid
```

If you also have an expenses table (not shown here), you can subtract that too.

---

## 6) Running with real values

### Option A: Replace placeholders directly
Example: January 2026

```sql
-- monthStart = '2026-01-01 00:00:00'
-- monthEnd   = '2026-02-01 00:00:00'

SELECT rp.pg_id,
       SUM(CAST(rp.amount_paid AS DECIMAL(10,2))) AS rent_received
FROM rent_payments rp
WHERE rp.payment_date >= '2026-01-01 00:00:00'
  AND rp.payment_date <  '2026-02-01 00:00:00'
  AND rp.status IN ('PAID','PARTIAL')
  AND (rp.is_deleted = 0 OR rp.is_deleted IS NULL)
GROUP BY rp.pg_id;
```

### Option B: Filter for a single PG
Add `AND rp.pg_id = :pgId` (or `= 3`) to each query.

---

## 7) Tenant rent period example (different tenants have different cycles)

Yes: **each tenant can have a different rent period**.

Your schema supports this via `tenant_rent_cycles`:

- `tenant_rent_cycles.cycle_start`
- `tenant_rent_cycles.cycle_end`
- `tenant_rent_cycles.cycle_type` (example: `MIDMONTH`)

### Example (same PG, different tenant periods)

Assume **January 2026** window:

- `monthStart = 2026-01-01`
- `monthEnd   = 2026-02-01`

Tenant A (check-in on 4th, MIDMONTH):

- Cycle: `2026-01-04 → 2026-02-03`
- Rent due for that cycle: `₹5,000`
- Payment done on: `2026-01-04` (PAID)

Tenant B (check-in on 15th, MIDMONTH):

- Cycle: `2026-01-15 → 2026-02-14`
- Rent due for that cycle: `₹6,000`
- Payment done on: `2026-02-01` (PAID)

### How monthly calculations treat them

1) **Cash-based rent received (Section 2)**

Cash is counted by `rent_payments.payment_date`.

- Tenant A payment date is in January → **counts in January**
- Tenant B payment date is on `2026-02-01` (monthEnd boundary) → **does NOT count in January** (because monthEnd is exclusive)

So January cash rent received includes only Tenant A.

2) **Earned rent (period-based, prorated)**

Earned rent is counted by cycle overlap with the month window (even if payment happens next month).

- Tenant A cycle overlaps Jan 2026 from `Jan 4 → Feb 1`
- Tenant B cycle overlaps Jan 2026 from `Jan 15 → Feb 1`

So both tenants contribute to **January earned rent**, but only for the portion of their cycle that lies inside January.

3) **MRR value (Section 4)**

MRR is based on whether the tenant allocation is active during the month:

- If allocation overlaps the month, it contributes to MRR.
- It does not depend on payment date.

---

## Notes / Common pitfalls

- **Decimals**: `amount_paid` is often stored as string/decimal. Always cast to decimal for SUM.
- **VOIDED**: If your system marks voided payments via `status='VOIDED'`, don’t include them.
- **Date columns**: Use the correct date column (`payment_date` for payments; `effective_from/to` for allocations).
- **Timezones**: Make sure `monthStart/monthEnd` match your DB timezone.

---

## Quick checklist

- **Cash received**: money collected this month (cash-in), based on `rent_payments.payment_date`
- **Refunds paid**: money paid out this month (cash-out), based on `refund_payments.payment_date`
- **Rent earned**: income generated for the month (used for profit)
  - Calendar cycle: prorate by days in the calendar month
  - Midmonth cycle: prorate by overlap with the tenant cycle (`tenant_rent_cycles`) vs total cycle days
- **MRR value**: sum of active allocation prices overlapping the month, based on `tenant_allocations.effective_from/to` + `bed_price_snapshot`
