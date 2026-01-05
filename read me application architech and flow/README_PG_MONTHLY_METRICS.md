📊 PG Monthly Metrics — Explained with Multiple Real Examples

We’ll always look at one month (say January).

For January, 3 numbers exist — always.

🧩 Example 1: Simple tenant (no confusion)
Tenant details

Rent: ₹5,000 / month

Staying full January

Paid on Jan 1

January results
Metric	Amount	Why
Cash Received	₹5,000	Payment came in January
Rent Earned	₹5,000	Stayed full month
MRR	₹5,000	Monthly value

👉 All numbers same ✅
(This is the simplest case)

🧩 Example 2: Tenant joins mid-month
Tenant details

Rent: ₹6,000 / month

Joined: Jan 10

Paid full ₹6,000 on Jan 10

January results

January has 31 days
Tenant stayed Jan 10 → Jan 31 = 22 days

Metric	Amount	Why
Cash Received	₹6,000	Full payment received
Rent Earned	~₹4,258	Paid only for 22 days
MRR	₹6,000	Monthly value

👉 Cash > Earned (this is NORMAL)

🧩 Example 3: Tenant paid late (next month)
Tenant details

Rent: ₹5,000

Stayed full January

Paid on Feb 2

January results
Metric	Amount	Why
Cash Received	₹0	No money in Jan
Rent Earned	₹5,000	Tenant stayed full Jan
MRR	₹5,000	Monthly value

👉 Earned > Cash
This means pending rent exists

🧩 Example 4: Partial payment
Tenant details

Rent: ₹4,000

Stayed full January

Paid only ₹2,500 on Jan 15

January results
Metric	Amount
Cash Received	₹2,500
Rent Earned	₹4,000
MRR	₹4,000

👉 Pending rent = ₹1,500
Still earned full rent, payment is separate.

🧩 Example 5: Midmonth cycle (common in PGs)
Tenant details

Cycle: Jan 15 → Feb 14

Rent per cycle: ₹6,000

Paid on Jan 15

January overlap

Stayed Jan 15 → Jan 31 = 17 days

Cycle length = 31 days

January results
Metric	Amount	Why
Cash Received	₹6,000	Paid in Jan
Rent Earned	~₹3,290	Only 17 days belong to Jan
MRR	₹6,000	Monthly value

👉 Payment date ≠ income date

🧩 Example 6: Room transfer (very important)
Tenant details

Old bed rent: ₹4,000 (Jan 1–14)

New bed rent: ₹5,000 (Jan 15–31)

Paid ₹4,000 on Jan 1

Paid ₹1,548 on Jan 25 (difference)

January earned calculation

Old bed (14 days): ~₹1,806

New bed (17 days): ~₹2,742

January results
Metric	Amount
Cash Received	₹5,548
Rent Earned	₹4,548
MRR	₹5,000

Important note
In the current API, MRR is calculated as the sum of all allocation snapshots that overlap the month.
So if a tenant has 2 allocations inside the same month (because of a transfer), MRR may include both snapshots for that month.
This is expected with the current logic.

🧩 Example 7: Multiple tenants (real PG view)
Tenant	Earned	Paid
A	₹5,000	₹5,000
B	₹4,258	₹6,000
C	₹1,548	₹2,000
PG totals (January)
Metric	Amount
Cash Received	₹13,000
Rent Earned	₹10,806
MRR	₹15,000

👉 This is normal and healthy data

🧠 Final simple rule (REMEMBER THIS)

Cash answers “how much money came in”,
Earned answers “how much income January generated”,
MRR answers “how valuable my PG is per month”.