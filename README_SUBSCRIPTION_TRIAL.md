# Subscription Trial / Free Plan (Org-Level)

## Behavior

- Subscriptions are **organization-scoped** (only the org SUPER_ADMIN buys).
- On `/auth/signup`, the backend auto-assigns a **free/trial plan** to the newly created organization.
- Trial validity is controlled by `subscription_plans.duration` (days).
- **Unlimited limits** are represented as `NULL` in `subscription_plans.max_*` columns.
  - Example: if `max_pg_locations` is `NULL`, the org can create unlimited PG locations.

## DB fields

### subscription_plans

- `is_trial` (BOOLEAN): marks plan as trial plan used at signup.
- `is_free` (BOOLEAN): marks plan as free plan.

The signup flow looks for an active plan in this priority (latest created first):

- `is_trial = 1` OR
- `is_free = 1` OR
- `price = 0.00` (backward compatibility)

### user_subscriptions

- `is_trial` (BOOLEAN): whether the created subscription row is a trial.

## SQL (MySQL) - Apply to existing DB

Run these in your MySQL DB (take a backup first).

### 1) Alter tables

```sql
ALTER TABLE subscription_plans
  ADD COLUMN is_free TINYINT(1) NOT NULL DEFAULT 0 AFTER max_tenants,
  ADD COLUMN is_trial TINYINT(1) NOT NULL DEFAULT 0 AFTER is_free;

ALTER TABLE user_subscriptions
  ADD COLUMN is_trial TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_renew;
```

### 2) (Optional) indexes

```sql
CREATE INDEX idx_subscription_plans_is_trial ON subscription_plans (is_trial);
CREATE INDEX idx_subscription_plans_is_free ON subscription_plans (is_free);
CREATE INDEX idx_user_subscriptions_is_trial ON user_subscriptions (is_trial);
```

### 3) Seed a trial plan (unlimited)

Edit `duration` as needed.

```sql
INSERT INTO subscription_plans (
  name,
  description,
  duration,
  price,
  currency,
  features,
  max_pg_locations,
  max_tenants,
  is_free,
  is_trial,
  is_active,
  created_at,
  updated_at,
  max_rooms,
  max_beds,
  max_employees,
  max_users,
  max_invoices_per_month,
  max_sms_per_month,
  max_whatsapp_per_month
)
VALUES (
  'Free Trial',
  'Free trial plan on signup',
  14,
  0.00,
  'INR',
  NULL,
  NULL,
  NULL,
  1,
  1,
  1,
  NOW(),
  NOW(),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
);
```

## Notes

- If you already have an existing `price=0.00` plan, you can simply mark it:

```sql
UPDATE subscription_plans
SET is_trial = 1
WHERE price = 0.00 AND is_active = 1
ORDER BY created_at DESC
LIMIT 1;
```
