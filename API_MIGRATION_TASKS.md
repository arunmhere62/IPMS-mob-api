# API Migration Tasks - Schema Changes

## Overview
After removing `users.pg_id` and `pg_locations.user_id`, we need to update all APIs that:
1. Use `pg_id` from headers (this is fine - refers to PG location filtering)
2. Reference `users.pg_id` field (REMOVED - needs pg_users table)
3. Reference `pg_locations.user_id` field (REMOVED - needs pg_users table)

---

## Impact Analysis

### ✅ NO CHANGES NEEDED
**APIs using `pg_id` as a filter/parameter are FINE** - they're filtering by PG location, not accessing the removed field.

Examples:
- Tenant APIs filtering by `pg_id`
- Visitor APIs filtering by `pg_id`
- Payment APIs filtering by `pg_id`
- Room/Bed APIs filtering by `pg_id`

### ⚠️ CHANGES NEEDED
**Only if APIs are:**
1. Creating/updating users with `pg_id` field
2. Querying `users.pg_id` directly
3. Creating/updating PG locations with `user_id` field
4. Querying `pg_locations.user_id` directly

---

## Files to Check/Update

### 1. **User/Employee Module**
**Files:**
- `src/modules/employee/employee.service.ts`
- `src/modules/employee/employee.controller.ts`
- `src/modules/auth/auth.service.ts`

**Check for:**
- User creation with `pg_id` field
- User updates with `pg_id` field
- Queries selecting `users.pg_id`

**Action:** If found, replace with `pg_users` table operations

---

### 2. **PG Location Module**
**Files:**
- `src/modules/pg-location/pg-location.service.ts`
- `src/modules/pg-location/pg-location.controller.ts`

**Check for:**
- PG creation with `user_id` field (owner)
- PG updates with `user_id` field
- Queries selecting `pg_locations.user_id`
- Queries to get PG owner

**Action:** If found, replace with `pg_users` table operations

---

### 3. **Organization Module**
**Files:**
- `src/modules/organization/organization.service.ts`
- `src/modules/organization/organization.controller.ts`

**Check for:**
- Superadmin assignment logic
- Organization creation with superadmin

**Action:** Add logic to set `organization.superadmin_id`

---

### 4. **Common Headers/Middleware**
**Files:**
- `src/common/decorators/common-headers.decorator.ts`
- `src/common/decorators/validated-headers.decorator.ts`
- Any middleware validating headers

**Check for:**
- Header validation logic
- `pg_id` header usage (this is OK - it's for filtering)

**Action:** Verify `pg_id` header is used for filtering, not accessing removed field

---

### 5. **DTOs (Data Transfer Objects)**
**Files:**
- `src/modules/employee/dto/*.dto.ts`
- `src/modules/pg-location/dto/*.dto.ts`
- `src/modules/organization/dto/*.dto.ts`

**Check for:**
- `pg_id` field in user/employee DTOs
- `user_id` field in PG location DTOs

**Action:** Remove these fields if present

---

## Migration Strategy

### **Option A: API First, Then UI (Recommended)**
**Approach:**
1. Fix all backend APIs first
2. Test with Postman/API testing
3. Deploy backend
4. Update mobile UI to match new API contracts
5. Test end-to-end

**Pros:**
- ✅ Backend is stable before UI changes
- ✅ Can test APIs independently
- ✅ Clear separation of concerns
- ✅ Easier to debug issues

**Cons:**
- ⏱️ Takes longer (sequential)
- 🚫 UI might break temporarily

---

### **Option B: Parallel (API + UI Together)**
**Approach:**
1. Create feature branch for both API and UI
2. Update API and UI simultaneously
3. Test together
4. Deploy both at same time

**Pros:**
- ⚡ Faster overall completion
- 🔄 No temporary breakage

**Cons:**
- ❌ More complex coordination
- ❌ Harder to isolate bugs
- ❌ Need to context-switch between backend/frontend

---

## Recommended Approach: **API First**

### **Phase 1: Backend API Changes (Do This First)**

#### Step 1: Search for Actual Issues
```bash
# Search for users.pg_id usage
grep -r "pg_id" src/modules/employee/ src/modules/auth/

# Search for pg_locations.user_id usage  
grep -r "user_id" src/modules/pg-location/
```

#### Step 2: Create New Services
- Create `pg-users.service.ts` for managing user-PG assignments
- Add methods:
  - `assignUserToPG(userId, pgId)`
  - `removeUserFromPG(userId, pgId)`
  - `getUserPGs(userId)`
  - `getPGUsers(pgId)`

#### Step 3: Update Existing Services
- Replace `users.pg_id` references with `pg_users` queries
- Replace `pg_locations.user_id` references with `pg_users` queries
- Update DTOs to remove old fields

#### Step 4: Test APIs
- Test user creation/updates
- Test PG location creation/updates
- Test user-PG assignment flows
- Test queries for user's PGs and PG's users

---

### **Phase 2: Mobile UI Changes (After Backend is Stable)**

#### Step 1: Update API Client
- Update API types/interfaces
- Remove `pg_id` from user objects
- Remove `user_id` from PG location objects

#### Step 2: Update UI Components
- Update forms that create/edit users
- Update forms that create/edit PG locations
- Update displays showing user's PG or PG's owner

#### Step 3: Test UI
- Test all user flows
- Test all PG management flows
- Test user-PG assignment UI

---

## Task Checklist

### Backend Tasks
- [ ] Search for actual `users.pg_id` usage in code
- [ ] Search for actual `pg_locations.user_id` usage in code
- [ ] Create `pg-users` module and service
- [ ] Update employee/user creation logic
- [ ] Update PG location creation logic
- [ ] Update organization superadmin logic
- [ ] Remove old fields from DTOs
- [ ] Test all affected APIs
- [ ] Update API documentation

### Frontend Tasks (After Backend)
- [ ] Update API client types
- [ ] Update user creation/edit forms
- [ ] Update PG location creation/edit forms
- [ ] Update user-PG assignment UI
- [ ] Test all user flows
- [ ] Test all PG management flows

---

## Next Steps

1. **Run searches** to find actual code that needs changes
2. **Create pg-users module** for managing assignments
3. **Update APIs one by one** following the checklist
4. **Test thoroughly** with Postman
5. **Then update mobile UI** to match new API contracts

---

## Notes

- Most APIs using `pg_id` as a filter parameter are FINE
- Only APIs directly accessing `users.pg_id` or `pg_locations.user_id` fields need changes
- The `pg_id` header for filtering is still valid and should remain
