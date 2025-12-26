# Subscription Limits (Plan Restrictions)

This project enforces subscription plan limits (ex: max tenants) by checking the organization’s **active subscription plan** before allowing resource creation.

## Where plan limits are defined

Prisma models:

- `subscription_plans` contains limits like:
  - `max_pg_locations`
  - `max_rooms`
  - `max_beds`
  - `max_employees`
  - `max_tenants`

- `user_subscriptions` links an organization to a plan:
  - `organization_id`
  - `plan_id`
  - `status` (`ACTIVE` / `PENDING` / etc.)
  - `end_date`

## How enforcement works

### Central service

File:

- `src/modules/subscription/subscription-restriction.service.ts`

This service:

1. Loads the organization’s active subscription:
   - `status = ACTIVE`
   - `end_date >= now`
2. Reads plan limits from `subscription_plans`
3. Counts current usage in DB
4. Throws `BadRequestException` with a clear message if the limit is reached

### Checks implemented

- **Create PG location**
  - Method: `assertCanCreatePgLocationForOrganization(organizationId)`
  - Limit used: `subscription_plans.max_pg_locations`
  - Current usage: count `pg_locations` where `organization_id = orgId` and `is_deleted = false`

- **Create room**
  - Method: `assertCanCreateRoomForPg(pgId)`
  - Limit used: `subscription_plans.max_rooms`
  - Current usage: count `rooms` where `pg_id = pgId` and `is_deleted = false`

- **Create bed**
  - Method: `assertCanCreateBedForRoom(roomId)`
  - Limit used: `subscription_plans.max_beds`
  - Current usage: count `beds` where `room_id = roomId` and `is_deleted = false`

- **Create employee**
  - Method: `assertCanCreateEmployeeForOrganization(organizationId)`
  - Limit used: `subscription_plans.max_employees`
  - Current usage: count `user` where `organization_id = orgId`, `status = ACTIVE`, `is_deleted = false`

- **Create tenant**
  - Method: `assertCanCreateTenantForOrganization(organizationId)`
  - Limit used: `subscription_plans.max_tenants`
  - Current usage: count `tenants` where `status = ACTIVE`, `is_deleted = false` and tenant’s `pg_locations.organization_id = orgId`

## Where the checks are called

- `PgLocationService.create(...)`
- `RoomService.create(...)`
- `BedService.create(...)`
- `EmployeeService.create(...)`
- `TenantService.create(...)`

## Module wiring

To inject `SubscriptionRestrictionService` into other modules:

- `SubscriptionModule` exports `SubscriptionRestrictionService`
- The consuming module imports `SubscriptionModule`

## Adding a new limit later

1. Add/confirm the limit column exists on `subscription_plans`.
2. Add a new `assertCanCreateXxx...()` method in `SubscriptionRestrictionService`.
3. Add the call at the top of the target `create()` method.
4. Ensure the module imports `SubscriptionModule`.

## Notes

- If a plan field is `NULL`, it is treated as **unlimited**.
- If there is no active subscription, creation is blocked with a message asking the user to subscribe.
