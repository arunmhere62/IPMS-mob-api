# API Changes Documentation for Mobile UI Team

## Date: December 31, 2025

## Overview
The backend database schema has been restructured to support many-to-many relationships between users and PG locations. This document outlines all API changes that affect the mobile UI.

---

## ⚠️ Breaking Changes

### 1. **User Profile API Response**

**Endpoint:** `GET /api/v1/auth/profile/:userId`

**Before:**
```json
{
  "data": {
    "s_no": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "pg_id": 5,
    "pg_location": {
      "s_no": 5,
      "location_name": "PG Name",
      "address": "123 Street"
    }
  }
}
```

**After:**
```json
{
  "data": {
    "s_no": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "pg_locations": [
      {
        "s_no": 5,
        "location_name": "PG Name 1",
        "address": "123 Street"
      },
      {
        "s_no": 8,
        "location_name": "PG Name 2",
        "address": "456 Avenue"
      }
    ]
  }
}
```

**Changes:**
- ❌ Removed: `pg_id` field
- ❌ Removed: `pg_location` (single object)
- ✅ Added: `pg_locations` (array of PG locations)

**UI Impact:**
- Update profile screen to handle multiple PG locations
- If user has multiple PGs, show a list/selector
- Remove any code that references `user.pg_id`

---

### 2. **Employee List API Response**

**Endpoint:** `GET /api/v1/employees`

**Before:**
```json
{
  "data": {
    "employees": [
      {
        "s_no": 10,
        "name": "Employee Name",
        "email": "employee@example.com",
        "pg_id": 5,
        "role_id": 3
      }
    ]
  }
}
```

**After:**
```json
{
  "data": {
    "employees": [
      {
        "s_no": 10,
        "name": "Employee Name",
        "email": "employee@example.com",
        "role_id": 3
      }
    ]
  }
}
```

**Changes:**
- ❌ Removed: `pg_id` field from employee objects

**UI Impact:**
- Remove any display of employee's assigned PG from list view
- To get employee's assigned PGs, use the new PG Users API (see below)

---

### 3. **Create Employee API Request**

**Endpoint:** `POST /api/v1/employees`

**Before:**
```json
{
  "name": "New Employee",
  "email": "employee@example.com",
  "password": "password123",
  "phone": "9876543210",
  "role_id": 3,
  "pg_id": 5,
  "gender": "MALE"
}
```

**After:**
```json
{
  "name": "New Employee",
  "email": "employee@example.com",
  "password": "password123",
  "phone": "9876543210",
  "role_id": 3,
  "gender": "MALE"
}
```

**Changes:**
- ❌ Removed: `pg_id` field from request body

**UI Impact:**
- Remove PG selection from employee creation form
- To assign employee to PG(s), use the new PG Users API after creation (see below)

---

### 4. **PG Location List API Response**

**Endpoint:** `GET /api/v1/pg-locations`

**Before:**
```json
{
  "data": [
    {
      "s_no": 5,
      "user_id": 1,
      "location_name": "PG Name",
      "address": "123 Street"
    }
  ]
}
```

**After:**
```json
{
  "data": [
    {
      "s_no": 5,
      "location_name": "PG Name",
      "address": "123 Street"
    }
  ]
}
```

**Changes:**
- ❌ Removed: `user_id` field (owner)

**UI Impact:**
- Remove any display of PG owner from list view
- To get PG's assigned users, use the new PG Users API (see below)

---

## ✅ New APIs Available

### **PG Users Management API**

These new endpoints manage the many-to-many relationship between users and PG locations.

#### 1. **Assign User to PG**

**Endpoint:** `POST /api/v1/pg-users/assign`

**Request:**
```json
{
  "user_id": 10,
  "pg_id": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "User assigned to PG successfully",
  "data": {
    "s_no": 1,
    "user_id": 10,
    "pg_id": 5,
    "is_active": true,
    "created_at": "2025-12-31T...",
    "user": {
      "s_no": 10,
      "name": "Employee Name",
      "email": "employee@example.com",
      "role_name": "MANAGER"
    },
    "pg_location": {
      "s_no": 5,
      "location_name": "PG Name",
      "address": "123 Street"
    }
  }
}
```

**Use Case:** Assign an employee to work at a specific PG location

---

#### 2. **Remove User from PG**

**Endpoint:** `POST /api/v1/pg-users/remove`

**Request:**
```json
{
  "user_id": 10,
  "pg_id": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "User removed from PG successfully"
}
```

**Use Case:** Remove an employee from a PG location

---

#### 3. **Get User's PG Locations**

**Endpoint:** `GET /api/v1/pg-users/user/:userId/pgs`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "s_no": 1,
      "user_id": 10,
      "pg_id": 5,
      "is_active": true,
      "pg_location": {
        "s_no": 5,
        "location_name": "PG Name 1",
        "address": "123 Street",
        "status": "ACTIVE"
      }
    },
    {
      "s_no": 2,
      "user_id": 10,
      "pg_id": 8,
      "is_active": true,
      "pg_location": {
        "s_no": 8,
        "location_name": "PG Name 2",
        "address": "456 Avenue",
        "status": "ACTIVE"
      }
    }
  ]
}
```

**Use Case:** Get all PG locations assigned to a specific user

---

#### 4. **Get PG's Users**

**Endpoint:** `GET /api/v1/pg-users/pg/:pgId/users`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "s_no": 1,
      "user_id": 10,
      "pg_id": 5,
      "is_active": true,
      "user": {
        "s_no": 10,
        "name": "Employee Name",
        "email": "employee@example.com",
        "phone": "9876543210",
        "role_id": 3,
        "roles": {
          "s_no": 3,
          "role_name": "MANAGER"
        }
      }
    }
  ]
}
```

**Use Case:** Get all users assigned to a specific PG location

---

#### 5. **Bulk Assign Users to PG**

**Endpoint:** `POST /api/v1/pg-users/bulk-assign`

**Request:**
```json
{
  "user_ids": [10, 15, 20],
  "pg_id": 5
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "userId": 10, "success": true, "assignment": {...} },
    { "userId": 15, "success": true, "assignment": {...} },
    { "userId": 20, "success": false, "error": "User not found" }
  ]
}
```

**Use Case:** Assign multiple employees to a PG at once

---

## 🔄 Migration Guide for Mobile UI

### **Step 1: Update User Profile Screen**

**Old Code:**
```typescript
// Assuming user has single PG
const pgId = user.pg_id;
const pgName = user.pg_location?.location_name;

<Text>Assigned PG: {pgName}</Text>
```

**New Code:**
```typescript
// User can have multiple PGs
const pgLocations = user.pg_locations || [];

{pgLocations.length > 0 ? (
  <View>
    <Text>Assigned PGs:</Text>
    {pgLocations.map(pg => (
      <Text key={pg.s_no}>{pg.location_name}</Text>
    ))}
  </View>
) : (
  <Text>No PG assigned</Text>
)}
```

---

### **Step 2: Update Employee Creation Flow**

**Old Flow:**
1. User fills employee form including PG selection
2. Submit creates employee with `pg_id`

**New Flow:**
1. User fills employee form (no PG selection)
2. Submit creates employee
3. **Optional:** Show PG assignment screen
4. Call `POST /api/v1/pg-users/assign` to assign to PG(s)

**Implementation:**
```typescript
// Create employee
const createEmployee = async (data) => {
  const response = await api.post('/employees', {
    name: data.name,
    email: data.email,
    password: data.password,
    phone: data.phone,
    role_id: data.role_id,
    gender: data.gender,
    // Remove pg_id from here
  });
  
  const newEmployee = response.data;
  
  // Optionally assign to PG(s)
  if (selectedPgIds.length > 0) {
    await assignEmployeeToPGs(newEmployee.s_no, selectedPgIds);
  }
};

const assignEmployeeToPGs = async (userId, pgIds) => {
  for (const pgId of pgIds) {
    await api.post('/pg-users/assign', { user_id: userId, pg_id: pgId });
  }
};
```

---

### **Step 3: Update PG Location Details Screen**

**Add "Assigned Users" Section:**

```typescript
const PGDetailsScreen = ({ pgId }) => {
  const [assignedUsers, setAssignedUsers] = useState([]);
  
  useEffect(() => {
    fetchAssignedUsers();
  }, [pgId]);
  
  const fetchAssignedUsers = async () => {
    const response = await api.get(`/pg-users/pg/${pgId}/users`);
    setAssignedUsers(response.data);
  };
  
  return (
    <View>
      <Text>PG Details</Text>
      
      <Text>Assigned Staff:</Text>
      {assignedUsers.map(assignment => (
        <View key={assignment.s_no}>
          <Text>{assignment.user.name}</Text>
          <Text>{assignment.user.roles.role_name}</Text>
          <Button 
            title="Remove" 
            onPress={() => removeUser(assignment.user_id)}
          />
        </View>
      ))}
      
      <Button title="Assign User" onPress={showAssignUserModal} />
    </View>
  );
};
```

---

### **Step 4: Update Employee List Screen**

**Add PG Assignment Action:**

```typescript
const EmployeeListScreen = () => {
  const assignToPG = async (userId) => {
    // Show PG selector modal
    const selectedPgId = await showPGSelector();
    
    // Assign user to PG
    await api.post('/pg-users/assign', {
      user_id: userId,
      pg_id: selectedPgId
    });
    
    showSuccess('Employee assigned to PG successfully');
  };
  
  return (
    <FlatList
      data={employees}
      renderItem={({ item }) => (
        <View>
          <Text>{item.name}</Text>
          <Text>{item.roles.role_name}</Text>
          <Button 
            title="Assign to PG" 
            onPress={() => assignToPG(item.s_no)}
          />
        </View>
      )}
    />
  );
};
```

---

## 📋 Testing Checklist

### **User Profile**
- [ ] Profile shows array of PG locations instead of single PG
- [ ] Handles users with 0 PGs
- [ ] Handles users with multiple PGs
- [ ] No errors when accessing `pg_locations` array

### **Employee Management**
- [ ] Can create employee without PG assignment
- [ ] Can assign employee to PG after creation
- [ ] Can assign employee to multiple PGs
- [ ] Can remove employee from PG
- [ ] Employee list doesn't show `pg_id` field

### **PG Location Management**
- [ ] Can create PG location (creator automatically assigned)
- [ ] Can view users assigned to PG
- [ ] Can assign users to PG
- [ ] Can remove users from PG
- [ ] PG list doesn't show `user_id` field

---

## 🚨 Common Issues & Solutions

### **Issue 1: "Cannot read property 'pg_id' of undefined"**
**Cause:** Code trying to access removed `user.pg_id` field  
**Solution:** Replace with `user.pg_locations` array

### **Issue 2: "Cannot read property 'pg_location' of undefined"**
**Cause:** Code trying to access removed `user.pg_location` object  
**Solution:** Replace with `user.pg_locations[0]` or iterate array

### **Issue 3: "pg_id is not a valid field"**
**Cause:** Sending `pg_id` in employee creation request  
**Solution:** Remove `pg_id` from request body, use PG Users API instead

### **Issue 4: "user_id is not a valid field"**
**Cause:** Trying to access `pg_location.user_id`  
**Solution:** Use PG Users API to get PG's assigned users

---

## 📞 Support

If you encounter any issues during migration:
1. Check this document for the specific API change
2. Test the new PG Users API endpoints
3. Verify request/response formats match the examples above

---

## Summary

**Key Changes:**
- Users can now be assigned to **multiple PG locations**
- PG locations can have **multiple users** assigned
- Use **PG Users API** for all user-PG assignments
- Remove all references to `users.pg_id` and `pg_locations.user_id`
- Update UI to handle arrays instead of single values

**Migration Priority:**
1. ✅ Update API client types/interfaces
2. ✅ Update user profile screen
3. ✅ Update employee creation flow
4. ✅ Update PG details screen
5. ✅ Test all user-PG assignment flows
