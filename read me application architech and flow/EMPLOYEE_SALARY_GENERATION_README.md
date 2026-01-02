# Employee Salary Generation (High-level Design)

This document proposes a table structure + flow to support a **"Generate Salary" button** (a payroll run) in addition to the existing `employee_salary` table.

## Goal

- Admin sets a **monthly salary amount** for each employee.
- Each month, admin clicks **Generate Salary**.
- System creates a **payroll run** and generates **salary items** for all eligible employees.
- Admin can review/adjust items (optional) and then **mark paid** (optional).

## Current schema (already present)

You already have these important tables:

- **`users`**: stores employees (and others)
- **`pg_locations`**: PG site, scoped to an `organization_id`
- **`pg_users`**: assignment of users to a PG (`is_active`)
- **`employee_salary`**: monthly salary records
  - key fields: `user_id`, `pg_id`, `month`, `salary_amount`, `paid_date`, `payment_method`, `remarks`, `is_deleted`
  - uniqueness: `@@unique([user_id, month, is_deleted])`

## Recommended high-level table plan

### 1) Salary amount source (NO new table)

Since you don’t want a compensation/config table, the generator still needs a **single place to read salary amounts**.

Recommended options (pick one):

- **Option A (Recommended): store salary on `pg_users`** (salary can differ per PG)
  - Add column: `pg_users.monthly_salary_amount` (DECIMAL)
  - This keeps salary attached to the existing PG assignment.

- **Option B: store salary on `users`** (same salary across all PGs)
  - Add column: `users.monthly_salary_amount` (DECIMAL)

- **Option C: derive salary from last `employee_salary` record**
  - Use the most recent salary amount as the “default”.
  - This is the least reliable option (fails for new employees with no history), so you’ll still need a fallback.

### 2) Payroll run header (NEW)
This table represents the single click event: “Generate salaries for January 2026”.

- `payroll_runs`
  - `s_no` (PK)
  - `organization_id` (FK)
  - `pg_id` (FK)
  - `month` (DATE) — store normalized as `YYYY-MM-01`
  - `status` (DRAFT/GENERATED/LOCKED/PAID/CANCELLED)
  - `generated_by` (FK -> users)
  - `generated_at`
  - `notes` (optional)
  - constraints:
    - `@@unique([pg_id, month])`  (prevents duplicate runs for same month)

### 3) Payroll run items (NEW)
Each employee’s generated salary line for that run.

- `payroll_run_items`
  - `s_no` (PK)
  - `run_id` (FK -> payroll_runs)
  - `user_id` (FK -> users)
  - `pg_id` (FK -> pg_locations) (optional redundancy but useful)
  - `gross_amount` (DECIMAL)
  - `deductions_amount` (DECIMAL)
  - `net_amount` (DECIMAL)
  - `paid_date` (nullable)
  - `payment_method` (nullable)
  - `remarks` (nullable)
  - `status` (GENERATED/ADJUSTED/PAID)
  - constraints:
    - `@@unique([run_id, user_id])` (one item per employee per run)
  - indexes:
    - `@@index([pg_id, user_id])`
    - `@@index([run_id])`

### 4) How this relates to existing `employee_salary`
You have two options:

#### Option 1 (Recommended): keep `employee_salary` as the final ledger, but generated via payroll tables
- `payroll_runs` + `payroll_run_items` are the *generation workspace*.
- When run is **LOCKED/PAID**, you create (or upsert) rows in `employee_salary`.
- Pros:
  - minimal changes to existing app screens/queries
  - payroll tables allow audit and “generate button” workflow

#### Option 2: repurpose `employee_salary` to be the payroll item table
- Add `run_id` to `employee_salary`
- Rename conceptually to “salary ledger item”
- Pros:
  - fewer tables
- Cons:
  - harder to keep clean separation of “run header” vs “items”

If you want a clean “Generate” feature with auditability, **Option 1** is best.

## Generator flow (what the button does)

### Endpoint idea
- `POST /payroll/generate`
  - body: `{ pg_id, month }` (month normalized)

### Steps
1. Validate user permissions (only admin roles).
2. Validate `pg_id` belongs to org.
3. Ensure no existing `payroll_runs` for `(pg_id, month)`.
4. Load eligible employees:
   - from `pg_users` where `pg_id = X and is_active = true`
   - join `users` where `is_deleted=false` and `status=ACTIVE`
5. For each employee, resolve salary amount:
   - if using `pg_users.monthly_salary_amount`: read from `pg_users`
   - else if using `users.monthly_salary_amount`: read from `users`
   - else if deriving from history: read last `employee_salary.salary_amount`
   - if missing salary amount: either skip employee or fail generation (recommended: fail with clear error)
6. Create:
   - `payroll_runs` row
   - `payroll_run_items` rows (one per employee)
7. Return run summary: count, totals.

### Mark paid flow
- `PATCH /payroll/runs/:runId/pay`
  - can mark all items paid with a default method/date, or allow per-item.

## Constraints / invariants

- Normalize month dates as `YYYY-MM-01`.
- One payroll run per PG per month (`@@unique([pg_id, month])`).
- One item per employee per run (`@@unique([run_id, user_id])`).
- If you keep `employee_salary` as final ledger:
  - also enforce one ledger salary per `(user_id, month)` (depending on how you want soft deletes handled).

## Minimal Prisma model sketches (illustrative)

> These are examples only; adjust to your naming conventions and existing enums.

```prisma
model payroll_runs {
  s_no            Int      @id @default(autoincrement())
  organization_id Int
  pg_id           Int
  month           DateTime @db.Date
  status          String   @db.VarChar(20)
  generated_by    Int
  generated_at    DateTime @default(now())
  notes           String?  @db.VarChar(255)

  @@unique([pg_id, month])
  @@index([organization_id])
  @@index([pg_id])
}

model payroll_run_items {
  s_no              Int      @id @default(autoincrement())
  run_id            Int
  pg_id             Int
  user_id           Int
  gross_amount      Decimal  @db.Decimal(10, 2)
  deductions_amount Decimal  @db.Decimal(10, 2)
  net_amount        Decimal  @db.Decimal(10, 2)
  paid_date         DateTime? @db.Date
  remarks           String?  @db.VarChar(255)
  status            String   @db.VarChar(20)

  @@unique([run_id, user_id])
  @@index([pg_id, user_id])
  @@index([run_id])
}
```

Optional (if you choose Option A salary source):

```prisma
model pg_users {
  // ...existing fields...
  monthly_salary_amount Decimal? @db.Decimal(10, 2)
}
```

## Recommended UI structure

- Screen 1: **Payroll Runs**
  - list of months with status (GENERATED/PAID)
  - button: Generate for selected month
- Screen 2: **Run Details**
  - list of run items (employees)
  - adjust amounts (optional)
  - mark paid

---

If you confirm whether salaries are **always PG-specific** (i.e., `employee_salary.pg_id` should be required), I can refine the constraints and the best unique key strategy for soft deletes.
