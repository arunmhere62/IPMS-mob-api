# Database Schema Issues and Required Corrections

## Analysis Date
December 31, 2025

## Overview
This document identifies relationship issues in the Prisma schema, specifically focusing on the `users`, `organization`, and `pg_locations` tables.

---

## Current Schema Problems

### 1. **Missing Foreign Key Relationship: User → Organization**

**Issue:**
- `users` table has `organization_id` field (line 70) but **NO foreign key relation defined**
- There's an index `fk_users_organization` (line 100) but the actual relation is missing
- Users cannot properly reference their organization

**Current State:**
```prisma
model User {
  organization_id  Int?
  // ... other fields
  
  @@index([organization_id], map: "fk_users_organization")
  // ❌ Missing: organization relation field
}
```

**Required Correction:**
```prisma
model User {
  organization_id  Int?
  // ... other fields
  organization     organization?  @relation(fields: [organization_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_users_organization")
  
  @@index([organization_id], map: "fk_users_organization")
}

model organization {
  s_no    Int     @id @default(autoincrement())
  // ... other fields
  users   User[]  // Add reverse relation
}
```

---

### 2. **Missing Foreign Key Relationship: User → PG Locations**

**Issue:**
- `users` table has `pg_id` field (line 68) but **NO foreign key relation defined**
- Users working at PG locations cannot be properly linked
- No way to query which users belong to which PG

**Current State:**
```prisma
model User {
  pg_id  Int?
  // ... other fields
  // ❌ Missing: pg_locations relation field
}
```

**Required Correction:**
```prisma
model User {
  pg_id         Int?
  // ... other fields
  pg_locations  pg_locations?  @relation(fields: [pg_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_users_pg")
  
  @@index([pg_id], map: "fk_users_pg")  // Add this index
}

model pg_locations {
  s_no   Int     @id @default(autoincrement())
  // ... other fields
  users  User[]  // Add reverse relation for employees/staff
}
```

---

### 3. **Incorrect PG Locations → User Relationship**

**Issue:**
- `pg_locations` has `user_id` field (line 251) which suggests "owner" relationship
- But there's **NO foreign key relation defined** for this field
- The index is named `owner_id` (line 284) which is confusing since the field is `user_id`
- This should represent the PG owner/creator, not general users

**Current State:**
```prisma
model pg_locations {
  user_id  Int
  // ... other fields
  // ❌ Missing: owner/creator user relation
  
  @@index([user_id], map: "owner_id")  // Confusing naming
}
```

**Required Correction:**
```prisma
model pg_locations {
  user_id      Int  // This represents the PG owner/creator
  // ... other fields
  owner        User  @relation("pg_owner", fields: [user_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_pg_owner")
  
  @@index([user_id], map: "fk_pg_owner")  // Rename index for clarity
}

model User {
  // ... other fields
  owned_pgs    pg_locations[]  @relation("pg_owner")  // PGs owned by this user
}
```

---

### 4. **Missing Superadmin Constraint**

**Issue:**
- Requirement states "only one user will be superadmin to one org"
- Users already have `role_id` field linked to `roles` table
- No unique constraint to enforce only one superadmin per organization
- Superadmin role likely exists in `roles` table, but nothing prevents multiple users with superadmin role in the same org

**Required Correction:**

**Recommended Approach: Add superadmin_id to organization table**

Since you already have a `roles` table managing user permissions, the superadmin should be assigned via role. However, to enforce "only ONE superadmin per organization", add a direct reference in the organization table:

```prisma
model organization {
  s_no           Int      @id @default(autoincrement())
  superadmin_id  Int?     @unique  // Only one superadmin per org
  // ... other fields
  superadmin     User?    @relation("org_superadmin", fields: [superadmin_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_org_superadmin")
  users          User[]   @relation("org_users")
  
  @@index([superadmin_id], map: "fk_org_superadmin")
}

model User {
  // ... other fields
  organization_id        Int?
  organization           organization?   @relation("org_users", fields: [organization_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_users_organization")
  superadmin_of_org      organization?   @relation("org_superadmin")
}
```

**How it works:**
1. User gets assigned a "SUPERADMIN" role via the existing `roles` table (for permissions)
2. Organization table has `superadmin_id` field pointing to that specific user
3. The `@unique` constraint on `superadmin_id` ensures only ONE user can be superadmin per org
4. Application logic should validate that the user being assigned as superadmin has the correct role

---

## Summary of Required Changes

### Changes to `User` model:

1. **Add organization relation:**
   ```prisma
   organization  organization?  @relation("org_users", fields: [organization_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_users_organization")
   ```

2. **Add pg_locations relation (for employees):**
   ```prisma
   pg_locations  pg_locations?  @relation("pg_employees", fields: [pg_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_users_pg")
   ```
   And add index:
   ```prisma
   @@index([pg_id], map: "fk_users_pg")
   ```

3. **Add owned PGs relation:**
   ```prisma
   owned_pgs  pg_locations[]  @relation("pg_owner")
   ```

4. **Add superadmin relation:**
   ```prisma
   superadmin_of_org  organization?  @relation("org_superadmin")
   ```

### Changes to `organization` model:

1. **Add users reverse relation:**
   ```prisma
   users          User[]  @relation("org_users")
   ```

2. **Add superadmin field and relation:**
   ```prisma
   superadmin_id  Int?     @unique
   superadmin     User?    @relation("org_superadmin", fields: [superadmin_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_org_superadmin")
   
   @@index([superadmin_id], map: "fk_org_superadmin")
   ```

### Changes to `pg_locations` model:

1. **Add owner relation (rename user_id relation):**
   ```prisma
   owner  User  @relation("pg_owner", fields: [user_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_pg_owner")
   ```

2. **Add employees reverse relation:**
   ```prisma
   employees  User[]  @relation("pg_employees")
   ```

3. **Update index name for clarity:**
   ```prisma
   @@index([user_id], map: "fk_pg_owner")  // Change from "owner_id"
   ```

---

## Relationship Diagram

```
Organization (1) ──────────────── (many) Users
     │                                      │
     │ (1 superadmin)                      │ (owns many)
     │                                      │
     └──────────────────────────────────── PG Locations (many)
                                             │
                                             │ (employs many)
                                             │
                                            Users (many)
```

**Relationships:**
- **One Organization** has **many Users** (employees, staff, etc.)
- **One Organization** has **one Superadmin User** (unique constraint)
- **One Organization** has **many PG Locations**
- **One User** can own **many PG Locations** (via `pg_locations.user_id`)
- **One User** can work at **one PG Location** (via `users.pg_id`)
- **One User** belongs to **one Organization** (via `users.organization_id`)

---

## Migration Steps

1. **Backup your database** before making any changes
2. Add the missing relation fields to the Prisma schema
3. Run `npx prisma format` to validate syntax
4. Run `npx prisma validate` to check for errors
5. Create migration: `npx prisma migrate dev --name fix-user-org-pg-relationships`
6. Review the generated SQL migration file
7. Apply migration to production: `npx prisma migrate deploy`

---

## Notes

- All foreign key relations use `onDelete: Restrict` to prevent accidental data loss
- The `organization_id` and `pg_id` in `users` table are nullable (`Int?`), allowing flexibility
- Consider adding validation at the application level to ensure business rules are enforced
- The superadmin constraint ensures only one user can be the superadmin per organization
