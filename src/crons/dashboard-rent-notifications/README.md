# Dashboard Rent Notification Crons

## Purpose
These cron jobs reuse the existing **Dashboard summary** rent-status logic to notify **ADMIN** and **SUPER_ADMIN** users (assigned to each PG) about rent issues.

The logic is reused from:
- `DashboardService.getTenantStatusWidgets({ pg_id })`

## Enable/Disable
By default, these cron jobs do nothing unless enabled via env flag:

- `CRON_JOB=true`

## What PGs are processed
- All PGs where:
  - `pg_locations.is_deleted = false`
  - `pg_locations.status = 'ACTIVE'`

## Who receives notifications
For each PG, recipients are:
- Users in `pg_users` where:
  - `pg_users.pg_id = <pg>`
  - `pg_users.is_active = true`
- And the linked user is:
  - `users.is_deleted = false`
  - `users.status = 'ACTIVE'`
  - `roles.role_name IN ('ADMIN', 'SUPER_ADMIN')` (case-insensitive)

## Cron schedules (Asia/Kolkata)
- Partial rent summary:
  - `0 10,21 * * *`
  - Cron name: `dashboard-rent-notifications-partial`

- Pending rent summary:
  - `0 10,21 * * *`
  - Cron name: `dashboard-rent-notifications-pending`

## Notifications sent
### 1) Partial rent summary
- **Type**: `PARTIAL_RENT_SUMMARY`
- **Title**: `⚠️ Partial Rent Pending`
- **Body**: `<count> tenants have partial rent pending in <pg_name>`
- **Data payload**:
  - `pg_id`
  - `partial_count`

### 2) Pending rent summary
- **Type**: `PENDING_RENT_SUMMARY`
- **Title**: `🔔 Rent Pending`
- **Body**: `<count> tenants have rent pending in <pg_name>`
- **Data payload**:
  - `pg_id`
  - `pending_count`

## Manual test APIs
These endpoints allow triggering the jobs manually (useful for testing):

- `POST /dashboard-rent-notification-cron/trigger-partial`
- `POST /dashboard-rent-notification-cron/trigger-pending`

> Note: Scheduled cron execution is gated by `CRON_JOB=true`.
> The manual trigger endpoints force-run the jobs for testing even if the env flag is disabled.
