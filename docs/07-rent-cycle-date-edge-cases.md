# Rent Cycle Creation — How It Works

---

## When are cycles created?

1. **On tenant registration** — immediately, inside the same DB transaction
2. **Every night at midnight IST** — cron job fills in any missing cycles for all active tenants

Both use the same logic. Re-running is safe — existing cycles are never duplicated (DB unique constraint + `skipDuplicates`).

---

## How a cycle is calculated

### CALENDAR type
- **First cycle:** check-in day → last day of that month (prorated)
- **All following cycles:** 1st → last day of each month

**Example — check-in Jan 15:**
```
Cycle 1: Jan 15 → Jan 31  (prorated)
Cycle 2: Feb 01 → Feb 28
Cycle 3: Mar 01 → Mar 31
...and so on
```

### MIDMONTH type
- Anchor day = tenant's check-in day (e.g. 15th)
- Each cycle runs from the **anchor day of one month to anchor day - 1 of the next**
- Full bed price is always charged — no proration

**Example — check-in Jan 15:**
```
Cycle 1: Jan 15 → Feb 14
Cycle 2: Feb 15 → Mar 14
Cycle 3: Mar 15 → Apr 14
...and so on
```

---

## How short months are handled (28th, 29th, 30th, 31st anchor days)

The rule is simple: **if the anchor day doesn't exist in a month, the last day of that month is used instead.**

**Anchor day 28:** No issues — every month has at least 28 days, so clamping never happens.

**Anchor day 29:** In normal months (Mar, Apr, etc.), the cycle runs 29th → 28th of next month. In February (non-leap year), the cycle starts on **Feb 28** instead of Feb 29.

**Anchor day 30:** In February, the cycle starts on the last day (Feb 28 or Feb 29 in leap year). The January cycle ending in February will also adjust — Jan 30 → Feb 27 (since Feb 30 doesn't exist).

**Anchor day 31:** This is the most complex case. Only 7 months have 31 days (Jan, Mar, May, Jul, Aug, Oct, Dec). In the other 5 months, the cycle starts on the last day instead:
- February: starts on Feb 28/29
- April, June, September, November: start on the 30th

**Example — anchor day 31, full year:**
```
Jan 31 → Feb 27    (Feb has 28 days, so next anchor Feb 31 → Feb 28, end = Feb 27)
Feb 28 → Mar 30    (Feb start clamped to 28th, next anchor Mar 31, end = Mar 30)
Mar 31 → Apr 29    (Apr has 30 days, so next anchor Apr 31 → Apr 30, end = Apr 29)
Apr 30 → May 30    (Apr start clamped to 30th, next anchor May 31, end = May 30)
May 31 → Jun 29    ...and so on
```

**Key point:** the cycle end date is always calculated as `(next anchor date) - 1 day`, so there are never any gaps or overlaps between cycles regardless of how short months get clamped.

---

## Safety rules

- Cycles are only created up to **today** — never in the future
- Cycles are never created before the tenant's **check-in date**
- Overlapping cycles are filtered out before saving
- Max 200 cycles per run (infinite-loop guard)

---

*Last Updated: June 2026*
