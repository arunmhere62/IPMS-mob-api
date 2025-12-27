# RBAC (Normalized) + Manual User Overrides

This project uses a normalized RBAC design (Option B):

- **Catalog**: `permissions_master` (what permissions exist)
- **Role grants**: `role_permissions` (which permissions a role has)
- **User overrides**: `user_permission_overrides` (exceptions for a single user)
- **User assignment**: `users.role_id` (which role the user belongs to)

The goal is:

- **Web portal (admin)** can manage roles/permissions/users.
- **PG owner mobile app** shows/hides screens/actions based on effective permissions.
- **Backend** always enforces permissions at runtime for every API call.

---

## 1) Tables: what each table is used for

### 1.1 `permissions_master` (catalog)

One row per permission.

- **Typical columns**: `screen_name`, `action`, `description`, etc.
- **Example permission key** (derived): `tenants_view` (screen `tenants`, action `VIEW`)

This table defines the *language* that both backend and frontend use.

### 1.2 `roles` (role list)

The role list is kept as-is.

- `roles.s_no`
- `roles.role_name`
- `roles.status`

Users point to a role via `users.role_id`.

### 1.3 `role_permissions` (role baseline grants)

This is the normalized replacement for any JSON-based role permission storage.

- `role_id` → `roles.s_no`
- `permission_id` → `permissions_master.s_no`
- Unique: (`role_id`, `permission_id`)

Meaning:

- If a row exists, that role has that permission.
- If no row exists, the role does not have it.

### 1.4 `user_permission_overrides` (manual exceptions)

Allows adding exceptions for a single user.

- `user_id` → `users.s_no`
- `permission_id` → `permissions_master.s_no`
- `effect`: `ALLOW | DENY`
- optional `created_by`, optional `expires_at`

Meaning:

- For one user, you can override role defaults.
- Use it to avoid creating many almost-identical roles.

---

## 2) Runtime permission evaluation (backend)

For every API request:

1. Identify the user (JWT)
2. Determine the permission needed for the route (example: `tenants_delete`)
3. Compute effective permission:

### Precedence rules (top wins)

1. **User override `DENY`** → deny
2. **User override `ALLOW`** → allow
3. **Role grant exists in `role_permissions`** → allow
4. Otherwise → deny

This logic should live in one place (Guard / middleware / helper), not inside controllers.

---

## 3) Web portal (admin) — screens and required APIs

This is the clean “admin control panel” view.

### 3.1 Screen: Permissions Master

Purpose:

- Create/view all permissions in `permissions_master`

APIs (existing or recommended):

- `GET /permissions` (list)
- `POST /permissions` (create)
- `PATCH /permissions/:id` (edit metadata)
- `DELETE /permissions/:id` (delete)

Backend rule:

- Deleting a permission must be blocked if used in:
  - `role_permissions`
  - `user_permission_overrides`

### 3.2 Screen: Roles

Purpose:

- Create/edit roles in `roles`

APIs:

- `GET /roles`
- `POST /roles`
- `PATCH /roles/:id`

### 3.3 Screen: Role Permissions (Role → Permissions)

Purpose:

- Assign baseline permissions to a role (writes to `role_permissions`)

APIs (already in `role-permissions` module):

- `GET /role-permissions/:roleId`
- `POST /role-permissions/:roleId/assign`
- `DELETE /role-permissions/:roleId/remove`
- `PATCH /role-permissions/:roleId/bulk-update`
- `POST /role-permissions/:sourceRoleId/copy-to/:targetRoleId`
- `GET /role-permissions/usage`

### 3.4 Screen: Users (User → Role)

Purpose:

- Assign a role to a user (updates `users.role_id`)

APIs (existing or recommended):

- `GET /users`
- `PATCH /users/:id/role` (set `role_id`)

---

## 4) PG owner mobile app — what changes in UI and APIs

## 4.A) Mob API implementation (what exists now)

RBAC endpoints are implemented in `src/modules/rbac`.

Folder layout:

- `rbac.controller.ts` (mounted under `auth`)
- `rbac.service.ts` (effective permission evaluation + permissions catalog)
- `permissions/rbac-permissions.controller.ts` (permissions catalog endpoints)
- `overrides/user-permission-overrides.controller.ts` + `overrides/user-permission-overrides.service.ts`

All responses use `ResponseUtil`.

Headers:

- Most endpoints use the existing header pattern.
- **Required header** for RBAC endpoints: `x-user-id`

Implemented APIs:

- `GET /auth/me/permissions`
  - Purpose: fetch effective permissions for the logged-in user
  - Required headers: `x-user-id`
  - Response includes:
    - `permissions_map`: `{ "tenants_view": true, ... }`
    - `permissions`: `["tenants_view", ...]`

- `GET /rbac/permissions`
  - Purpose: permissions catalog from `permissions_master` (for building UI forms)

- `GET /rbac/permissions/grouped`
  - Purpose: same catalog grouped by `screen_name`

- `GET /user-permission-overrides?user_id=...`
  - Purpose: list overrides for a target user/employee
  - Required headers: `x-user-id`

- `POST /user-permission-overrides`
  - Purpose: create/replace one override (upsert)
  - Required headers: `x-user-id`

- `DELETE /user-permission-overrides`
  - Purpose: remove one override
  - Required headers: `x-user-id`

### 4.1 Mobile UI screens: how to decide what to show

The mobile app should:

1. Fetch the logged-in user profile (contains `role_id`)
2. Fetch the user’s effective permissions
3. Hide/disable:
   - Screens (navigation)
   - Buttons (create/edit/delete)
   - Actions (bulk operations)

Recommended backend endpoint for mobile:

- `GET /auth/me/permissions` (or `GET /users/me/permissions`)

Permissions catalog endpoint for mobile UI (for building override forms):

- `GET /rbac/permissions`
- `GET /rbac/permissions/grouped`

Response shape (suggested):

- a flat map: `{ "tenants_view": true, "tenants_delete": false, ... }`
- and/or an array: `["tenants_view", "beds_edit"]`

### 4.3 Mobile screen: Employee → Permission Overrides

Purpose:

- PG owner can add exceptions for a single employee/user (writes to `user_permission_overrides`)

Recommended APIs:

- `GET /user-permission-overrides?user_id=...`
- `POST /user-permission-overrides` (create/replace one override)
- `DELETE /user-permission-overrides` (remove one override)

## 4.B) Mobile frontend flow (recommended)

High-level:

1. On login / app startup:
   - call `GET /auth/me/permissions`
   - store `permissions_map` in global state
2. Create a small helper:
   - `hasPermission(key)` (reads from `permissions_map`)
3. Apply RBAC in UI:
   - hide navigation items
   - disable buttons (create/edit/delete)
   - block actions (show toast/alert if not allowed)
4. Employee overrides UI (PG owner only):
   - Entry point: Employee details → "Permission Overrides"
   - Load permissions catalog once (cache it):
     - `GET /rbac/permissions/grouped`
   - Load current overrides for selected employee:
     - `GET /user-permission-overrides?user_id=<employeeUserId>`
   - For each permission:
     - show current override state: none / ALLOW / DENY
     - on change:
       - `POST /user-permission-overrides`
     - on clear:
       - `DELETE /user-permission-overrides`

### 4.2 Mobile APIs: backend still enforces

Even if UI hides buttons, backend must enforce permissions.

Examples (permission → APIs):

- `pg_locations_create` → `POST /pg-locations`
- `rooms_create` → `POST /rooms`
- `beds_create` → `POST /beds`
- `tenants_create` → `POST /tenants`
- `tenants_delete` → `DELETE /tenants/:id`

Backend should reject with 403 if not allowed.

---

## 5) Implementation mapping (how code uses tables)

### 5.1 Role permission management

Module: `role-permissions`

- Writes: `role_permissions` (createMany/deleteMany)
- Reads: `permissions_master` + `role_permissions` to return `granted: true/false`

### 5.2 Permission deletion safety

Module: `permissions`

- Before deleting from `permissions_master`, check usage in:
  - `role_permissions`
  - `user_permission_overrides`

---

## 6) Notes / migration

Because MySQL user may not allow Prisma shadow DB creation:

- Create tables via SQL DDL (manual)
- Run `npx prisma generate`
