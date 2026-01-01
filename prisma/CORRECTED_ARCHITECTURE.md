# Corrected Database Architecture - Many-to-Many Design

## Date: December 31, 2025

## Business Requirements Confirmed

✅ **Users can work at MULTIPLE PG locations simultaneously**  
✅ **PG locations can have MULTIPLE owners/managers**  
✅ **Existing data is dummy/test data - safe to modify**  
✅ **Willing to refactor APIs for correct architecture**

---

## Current Problems

### 1. **Wrong Relationship Design**
- `users.pg_id` - Implies one user → one PG (INCORRECT)
- `pg_locations.user_id` - Implies one PG → one owner (INCORRECT)
- These fields create artificial one-to-many constraints

### 2. **Missing Foreign Keys**
- `users.organization_id` - No FK constraint
- `pg_locations.organization_id` - No FK constraint

### 3. **No Many-to-Many Support**
- Cannot assign multiple users to one PG
- Cannot assign one user to multiple PGs
- No way to track user roles per PG (owner, manager, employee)

---

## Corrected Architecture

### **Relationship Model**

```
Organization (1) ──────────── (many) Users
     │                              │
     │                              │
     │                              │ (many-to-many via pg_users)
     │                              │
     └────────── (many) PG Locations ────────┘
                        │
                        │ (many-to-many via pg_users)
                        │
                      Users
```

**Key Relationships:**
- **One Organization** → **Many Users**
- **One Organization** → **Many PG Locations**
- **Many Users** ↔ **Many PG Locations** (via `pg_users` junction table)
- **One Organization** → **One Superadmin User** (unique constraint)

---

## Database Changes Required

### **STEP 1: Backup Existing Data (If Needed)**

Even though data is dummy, backup the mapping:

```sql
-- Backup user-to-pg mappings
CREATE TABLE _backup_user_pg_mapping AS
SELECT s_no as user_id, pg_id, 'employee' as role_type
FROM users
WHERE pg_id IS NOT NULL;

-- Backup pg-to-owner mappings
CREATE TABLE _backup_pg_owner_mapping AS
SELECT s_no as pg_id, user_id, 'owner' as role_type
FROM pg_locations
WHERE user_id IS NOT NULL;
```

---

### **STEP 2: Remove Wrong Columns**

```sql
-- 1. Remove pg_id from users table
ALTER TABLE users
DROP FOREIGN KEY IF EXISTS fk_users_pg;

ALTER TABLE users
DROP INDEX IF EXISTS fk_users_pg;

ALTER TABLE users
DROP COLUMN pg_id;

-- 2. Remove user_id from pg_locations table
ALTER TABLE pg_locations
DROP FOREIGN KEY IF EXISTS fk_pg_owner;

ALTER TABLE pg_locations
DROP INDEX IF EXISTS owner_id;

ALTER TABLE pg_locations
DROP COLUMN user_id;
```

---

### **STEP 3: Add Foreign Keys to Existing Relationships**

```sql
-- 3. Add FK: users → organization
ALTER TABLE users
ADD CONSTRAINT fk_users_organization
FOREIGN KEY (organization_id)
REFERENCES organization(s_no)
ON DELETE RESTRICT
ON UPDATE RESTRICT;

-- 4. Add FK: pg_locations → organization
ALTER TABLE pg_locations
ADD CONSTRAINT fk_pg_locations_organization
FOREIGN KEY (organization_id)
REFERENCES organization(s_no)
ON DELETE CASCADE
ON UPDATE RESTRICT;
```

---

### **STEP 4: Create Junction Table (Many-to-Many)**

```sql
-- 5. Create pg_users junction table
CREATE TABLE pg_users (
  s_no INT AUTO_INCREMENT PRIMARY KEY,
  
  pg_id INT NOT NULL,
  user_id INT NOT NULL,
  
  -- Role/permission flags
  is_owner BOOLEAN DEFAULT FALSE,
  is_manager BOOLEAN DEFAULT FALSE,
  is_employee BOOLEAN DEFAULT TRUE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign keys
  CONSTRAINT fk_pg_users_pg
    FOREIGN KEY (pg_id)
    REFERENCES pg_locations(s_no)
    ON DELETE CASCADE
    ON UPDATE RESTRICT,
  
  CONSTRAINT fk_pg_users_user
    FOREIGN KEY (user_id)
    REFERENCES users(s_no)
    ON DELETE CASCADE
    ON UPDATE RESTRICT,
  
  -- Prevent duplicate assignments
  UNIQUE KEY uq_pg_user (pg_id, user_id),
  
  -- Indexes for performance
  INDEX idx_pg_users_user (user_id),
  INDEX idx_pg_users_pg (pg_id),
  INDEX idx_pg_users_active (is_active)
);
```

---

### **STEP 5: Migrate Existing Data (Optional)**

If you want to preserve the dummy data mappings:

```sql
-- Migrate users.pg_id → pg_users (as employees)
INSERT INTO pg_users (pg_id, user_id, is_employee, is_owner, is_manager)
SELECT pg_id, s_no, TRUE, FALSE, FALSE
FROM _backup_user_pg_mapping;

-- Migrate pg_locations.user_id → pg_users (as owners)
INSERT INTO pg_users (pg_id, user_id, is_owner, is_employee, is_manager)
SELECT pg_id, user_id, TRUE, FALSE, FALSE
FROM _backup_pg_owner_mapping
ON DUPLICATE KEY UPDATE 
  is_owner = TRUE;

-- Drop backup tables
DROP TABLE _backup_user_pg_mapping;
DROP TABLE _backup_pg_owner_mapping;
```

---

### **STEP 6: Add Superadmin Constraint**

```sql
-- 6. Add superadmin_id to organization table
ALTER TABLE organization
ADD COLUMN superadmin_id INT NULL UNIQUE,
ADD CONSTRAINT fk_org_superadmin
FOREIGN KEY (superadmin_id)
REFERENCES users(s_no)
ON DELETE RESTRICT
ON UPDATE RESTRICT;

-- Add index
CREATE INDEX idx_org_superadmin ON organization(superadmin_id);
```

---

## Updated Prisma Schema

### **New Models**

```prisma
model User {
  s_no                Int                 @id @default(autoincrement())
  name                String              @db.VarChar(100)
  email               String?             @unique @db.VarChar(100)
  password            String?             @db.VarChar(255)
  phone               String?             @db.VarChar(15)
  status              users_status?       @default(ACTIVE)
  role_id             Int
  organization_id     Int?
  is_deleted          Boolean?            @default(false)
  // ... other fields
  
  // Relations
  roles                    roles              @relation(fields: [role_id], references: [s_no], onUpdate: Restrict, map: "fk_users_role")
  organization             organization?      @relation("org_users", fields: [organization_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_users_organization")
  superadmin_of_org        organization?      @relation("org_superadmin")
  pg_users                 pg_users[]         // Many-to-many with PG locations
  // ... other relations
  
  @@index([role_id], map: "fk_users_role")
  @@index([organization_id], map: "fk_users_organization")
  @@map("users")
}

model organization {
  s_no            Int                 @id @default(autoincrement())
  name            String              @db.VarChar(100)
  description     String?             @db.Text
  superadmin_id   Int?                @unique
  is_deleted      Boolean?            @default(false)
  status          organization_status @default(ACTIVE)
  created_at      DateTime?           @default(now()) @db.DateTime(0)
  updated_at      DateTime?           @default(now()) @db.DateTime(0)
  // ... other fields
  
  // Relations
  superadmin      User?           @relation("org_superadmin", fields: [superadmin_id], references: [s_no], onDelete: Restrict, onUpdate: Restrict, map: "fk_org_superadmin")
  users           User[]          @relation("org_users")
  pg_locations    pg_locations[]
  legal_documents legal_documents[]
  
  @@index([superadmin_id], map: "fk_org_superadmin")
}

model pg_locations {
  s_no             Int                          @id @default(autoincrement())
  location_name    String                       @db.VarChar(100)
  address          String                       @db.VarChar(255)
  organization_id  Int
  city_id          Int?
  state_id         Int?
  is_deleted       Boolean                      @default(false)
  status           pg_locations_status?         @default(ACTIVE)
  // ... other fields
  
  // Relations
  organization     organization    @relation(fields: [organization_id], references: [s_no], onDelete: CASCADE, map: "fk_pg_locations_organization")
  city             city?           @relation(fields: [city_id], references: [s_no], onDelete: CASCADE, onUpdate: Restrict, map: "fk_city")
  state            state?          @relation(fields: [state_id], references: [s_no], onDelete: CASCADE, onUpdate: Restrict, map: "fk_state")
  pg_users         pg_users[]      // Many-to-many with users
  rooms            rooms[]
  beds             beds[]
  // ... other relations
  
  @@index([organization_id], map: "fk_pg_locations_organization")
  @@index([city_id], map: "fk_city")
  @@index([state_id], map: "fk_state")
}

// NEW: Junction table for many-to-many relationship
model pg_users {
  s_no        Int       @id @default(autoincrement())
  pg_id       Int
  user_id     Int
  is_owner    Boolean?  @default(false)
  is_manager  Boolean?  @default(false)
  is_employee Boolean?  @default(true)
  is_active   Boolean?  @default(true)
  created_at  DateTime  @default(now()) @db.Timestamp(0)
  updated_at  DateTime  @default(now()) @db.Timestamp(0)
  
  // Relations
  pg_location pg_locations @relation(fields: [pg_id], references: [s_no], onDelete: Cascade, onUpdate: Restrict, map: "fk_pg_users_pg")
  user        User         @relation(fields: [user_id], references: [s_no], onDelete: Cascade, onUpdate: Restrict, map: "fk_pg_users_user")
  
  @@unique([pg_id, user_id], map: "uq_pg_user")
  @@index([user_id], map: "idx_pg_users_user")
  @@index([pg_id], map: "idx_pg_users_pg")
  @@index([is_active], map: "idx_pg_users_active")
}
```

---

## API Changes Required

### **Before (Old Schema)**

```typescript
// Get user with their PG
const user = await prisma.user.findUnique({
  where: { s_no: 1 },
  select: {
    name: true,
    pg_id: true  // ❌ This field no longer exists
  }
});

// Get PG with owner
const pg = await prisma.pg_locations.findUnique({
  where: { s_no: 1 },
  select: {
    location_name: true,
    user_id: true  // ❌ This field no longer exists
  }
});
```

### **After (New Schema)**

```typescript
// Get user with all their PG locations
const user = await prisma.user.findUnique({
  where: { s_no: 1 },
  include: {
    pg_users: {
      include: {
        pg_location: true
      },
      where: { is_active: true }
    }
  }
});

// Get PG with all users (owners, managers, employees)
const pg = await prisma.pg_locations.findUnique({
  where: { s_no: 1 },
  include: {
    pg_users: {
      include: {
        user: true
      },
      where: { is_active: true }
    }
  }
});

// Get only owners of a PG
const pgOwners = await prisma.pg_users.findMany({
  where: {
    pg_id: 1,
    is_owner: true,
    is_active: true
  },
  include: {
    user: true
  }
});

// Assign user to PG as manager
await prisma.pg_users.create({
  data: {
    pg_id: 1,
    user_id: 5,
    is_manager: true,
    is_employee: false,
    is_owner: false
  }
});
```

---

## Migration Execution Plan

### **Development Environment**

1. **Create migration file:**
   ```bash
   npx prisma migrate dev --name restructure-user-pg-relationships --create-only
   ```

2. **Review generated SQL** in `prisma/migrations/` folder

3. **Apply migration:**
   ```bash
   npx prisma migrate dev
   ```

4. **Regenerate Prisma Client:**
   ```bash
   npx prisma generate
   ```

### **Production Environment**

1. **Backup database:**
   ```bash
   mysqldump -u user -p database_name > backup_before_migration.sql
   ```

2. **Apply migration:**
   ```bash
   npx prisma migrate deploy
   ```

3. **Verify data integrity:**
   Run the validation queries below

---

## Validation Queries

```sql
-- 1. Check users → organization relationship
SELECT u.s_no, u.name, o.name AS organization
FROM users u
LEFT JOIN organization o ON o.s_no = u.organization_id
WHERE u.is_deleted = FALSE;

-- 2. Check pg_locations → organization relationship
SELECT p.s_no, p.location_name, o.name AS organization
FROM pg_locations p
JOIN organization o ON o.s_no = p.organization_id
WHERE p.is_deleted = FALSE;

-- 3. Check many-to-many user-PG assignments
SELECT 
  u.name AS user_name,
  p.location_name AS pg_name,
  pu.is_owner,
  pu.is_manager,
  pu.is_employee
FROM pg_users pu
JOIN users u ON u.s_no = pu.user_id
JOIN pg_locations p ON p.s_no = pu.pg_id
WHERE pu.is_active = TRUE;

-- 4. Check superadmin assignments
SELECT o.name AS organization, u.name AS superadmin
FROM organization o
LEFT JOIN users u ON u.s_no = o.superadmin_id;

-- 5. Find PGs with multiple owners
SELECT p.location_name, COUNT(*) as owner_count
FROM pg_users pu
JOIN pg_locations p ON p.s_no = pu.pg_id
WHERE pu.is_owner = TRUE AND pu.is_active = TRUE
GROUP BY p.s_no, p.location_name
HAVING owner_count > 1;

-- 6. Find users assigned to multiple PGs
SELECT u.name, COUNT(*) as pg_count
FROM pg_users pu
JOIN users u ON u.s_no = pu.user_id
WHERE pu.is_active = TRUE
GROUP BY u.s_no, u.name
HAVING pg_count > 1;
```

---

## Benefits of New Architecture

✅ **Flexibility:** Users can manage multiple PG locations  
✅ **Scalability:** PGs can have multiple owners/managers  
✅ **Role-based:** Track user roles per PG (owner, manager, employee)  
✅ **Data Integrity:** Proper foreign key constraints  
✅ **Query Power:** Rich relationship queries with Prisma  
✅ **Future-proof:** Easy to add more user-PG relationship types  

---

## Next Steps

1. Review this document thoroughly
2. Run the SQL migration scripts in order
3. Update Prisma schema file
4. Regenerate Prisma Client
5. Update all API endpoints that reference `users.pg_id` or `pg_locations.user_id`
6. Test thoroughly in development
7. Deploy to production

---

## Files to Update

- `prisma/schema.prisma` - Add `pg_users` model, update `User` and `pg_locations` models
- All API routes/controllers that query user PG assignments
- All API routes/controllers that query PG owners
- Frontend code that displays user-PG relationships
