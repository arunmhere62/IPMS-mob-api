# 🛏️ Beds Management

> **Simple Guide:** How PG Owners add and manage beds in their rooms

---

## 📋 What is a Bed?

A **Bed** is a sleeping space within a room that can be assigned to a tenant. Each bed has a unique number within a room and a rental price.

**Example:**
- Room 101 contains: BED1, BED2, BED3
- Room 102 contains: BED-A, BED-B

---

## 🚀 What You Can Do

| Action | Description |
|--------|-------------|
| ➕ **Create** | Add a new bed to a room |
| 📋 **View** | See all beds with occupancy status |
| ✏️ **Edit** | Change bed number, price, or photos |
| 🗑️ **Delete** | Remove a bed (soft delete) |

---

## 📱 Frontend Flow (Mobile App)

### Screen 1: Beds List (`BedsScreen.tsx`)

**What User Sees:**
```
┌─────────────────────────────┐
│  🛏️ Beds                    │
│  Room 101                   │
├─────────────────────────────┤
│                             │
│ 🔍 Search beds...           │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🛏️ BED1                │ │
│ │    💰 ₹8,000/month      │ │
│ │    🟢 Available        │ │
│ │    [Edit] [Delete]     │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🛏️ BED2                │ │
│ │    💰 ₹8,000/month      │ │
│ │    🔴 Occupied         │ │
│ │    Rajesh Kumar         │ │
│ └─────────────────────────┘ │
│                             │
│     [+ Add New Bed]         │
│                             │
└─────────────────────────────┘
```

**Features:**
- 📋 List all beds with price and occupancy status
- 🟢🟡🔴 Color-coded: Available / Occupied
- 🔍 Search by bed number
- 🏠 Filter by room
- 🔄 Pull-to-refresh
- ✏️ Edit (if has permission)
- 🗑️ Delete (if has permission)
- ➕ Add tenant button (only for available beds)

---

### Screen 2: Add/Edit Bed (`BedFormModal.tsx`)

**Form Fields:**
```
┌─────────────────────────────┐
│  ➕ Add New Bed             │
│  Room: 101                  │
├─────────────────────────────┤
│                             │
│  Bed Number *               │
│  [BED1        ]             │
│  (Locked if tenant exists)  │
│                             │
│  Bed Price (₹) *            │
│  [8000        ]             │
│                             │
│  📸 Upload Photos           │
│  [📷] [📷]                  │
│                             │
│  [     Save Bed     ]       │
│                             │
└─────────────────────────────┘
```

**Field Details:**

- 🏷️ **Bed Number** (Required) - A unique identifier for the bed within the room (e.g., "1", "2", "A"). The frontend automatically adds "BED" prefix. Must be unique within the same room

- 💰 **Bed Price** (Required) - The monthly rent amount for this bed. Only numbers allowed (e.g., 8000, 7500.50)

- 📸 **Photos** (Optional) - Bed images for reference. Maximum 2 images allowed. Old images are automatically deleted from S3 when replaced

**Important:** Bed number is **LOCKED** once a tenant has been assigned (even if tenant moved out).

---

## 📋 Business Rules (Main Restrictions)

### When Creating a Bed:

The system performs these validations before creating a bed:

- 📊 **Subscription Limit Check** - The system counts your existing beds against your plan limit. If you've reached the maximum: *"Bed limit reached. Your plan allows up to X beds"*

- 🚪 **Room Existence Check** - The system verifies the selected room exists. If not found: *"Room with ID X not found"*

- 🔍 **Duplicate Bed Number Check** - The system checks if the bed number already exists in the same room. If found: *"Bed number 'BED1' already exists in this room"*

- 🏷️ **BED Prefix Auto-Addition (Frontend)** - The frontend automatically adds "BED" prefix. For example, entering "1" becomes "BED1"

- 💰 **Price Validation** - Only numeric values allowed. Minimum price is ₹0.01

### When Updating a Bed:

Before applying updates, the system checks:

- 🔒 **Bed Number Lock** - The system checks tenant allocation history. If any tenant was ever assigned to this bed, the bed number is permanently locked: *"Bed number cannot be changed once it has been assigned to a tenant"*

- 🚪 **Room Change Validation** - You can move the bed to a different room. The system verifies the target room exists. If not found: *"Room with ID X not found"*

- 📸 **S3 Image Cleanup** - If you're updating photos, the system automatically deletes old images from S3 storage to save space

### When Deleting a Bed:

The system performs strict checks before allowing deletion:

- 👤 **Active Tenant Check** - The system checks for any ACTIVE tenant assigned to this bed. If found: *"Cannot delete bed while a tenant is assigned to it"*

- 🗑️ **Soft Delete** - If all checks pass, the bed is soft deleted by:
  - Renaming to `BED1__DELETED__{id}` format
  - Marking `is_deleted = true`
  - This preserves historical data while hiding from active lists

- 📸 **S3 Images Cleanup** - All associated images are permanently deleted from S3 storage

### When Viewing Beds:

When fetching the bed list, the system applies these filters and calculations:

- 🟢🔴 **Occupancy Status Calculation** - The system checks for active tenants:
  - 🟢 Available = No active tenant assigned to the bed
  - 🔴 Occupied = An active tenant is assigned to the bed

- 🛏️ **Unoccupied Filter** - When `only_unoccupied=true` is passed, only available (non-occupied) beds are returned

- 🚪 **Room Filter** - You can filter beds by a specific room ID to see only beds in that room

- 🔍 **Search Function** - Search by bed number using case-insensitive matching

---

## ⚙️ Backend Logic

### API Endpoints:
```
Bed Module
├── GET    /beds              → List all beds (with filters)
├── GET    /beds/room/:id     → Get beds by room ID
├── GET    /beds/:id          → Get single bed
├── POST   /beds              → Create new bed
├── PUT    /beds/:id          → Update bed
└── DELETE /beds/:id          → Soft delete bed
```

### Database Schema (beds table):

**Core Columns:**
- `s_no` (INT, Primary Key) - Auto-increment unique identifier for the bed
- `bed_no` (VARCHAR) - Bed number as displayed (e.g., "BED1", "BED-A")

**Relationships:**
- `room_id` (INT, Foreign Key) - Reference to the parent room
- `pg_id` (INT, Foreign Key) - Reference to the parent PG location

**Pricing:**
- `bed_price` (DECIMAL) - Monthly rent amount for this bed

**Media & Deletion:**
- `images` (JSON) - Array of S3 image URLs for bed photos
- `is_deleted` (BOOLEAN) - Soft delete flag for data preservation

### Relationships:
```
beds
    ├── rooms (FK) → Parent room
    ├── pg_locations (FK) → Parent PG
    └── tenants (1:N) → Assigned tenants
```

---

## 🔒 Permissions

**Role-Based Access:**

- **Super Admin** - Full access to all bed operations:
  - ✅ View all beds
  - ✅ Create new beds
  - ✅ Edit existing beds
  - ✅ Delete beds

- **Admin** - Can manage but not delete:
  - ✅ View all beds
  - ✅ Create new beds
  - ✅ Edit existing beds
  - ❌ Cannot delete beds

- **Manager** - View-only access:
  - ✅ View all beds
  - ❌ Cannot create beds
  - ❌ Cannot edit beds
  - ❌ Cannot delete beds

- **Staff** - View-only access:
  - ✅ View all beds
  - ❌ Cannot create beds
  - ❌ Cannot edit beds
  - ❌ Cannot delete beds

**Permission Codes Used:**
- `VIEW_BED` - Permission to see bed list and occupancy status
- `CREATE_BED` - Permission to add new beds
- `EDIT_BED` - Permission to modify existing beds
- `DELETE_BED` - Permission to remove beds (soft delete)

---

## ⚠️ Error Handling

Common errors and how to resolve them:

- **"Bed number already exists"**
  - **Cause:** Another bed in the same room already uses this number
  - **Solution:** Use a different, unique bed number

- **"Bed number cannot be changed"**
  - **Cause:** Trying to edit bed number when a tenant was ever assigned (even if they moved out)
  - **Solution:** Bed number is permanently locked once any tenant history exists

- **"Cannot delete bed"**
  - **Cause:** An active tenant is currently assigned to this bed
  - **Solution:** Move the tenant to another bed or checkout the tenant first

- **"Room not found"**
  - **Cause:** The room ID provided doesn't exist
  - **Solution:** Select a valid room from the dropdown

- **"Bed limit reached"**
  - **Cause:** You've reached your subscription plan's bed limit
  - **Solution:** Upgrade to a higher plan for more beds

---

## 💡 Key Points

- 📊 **Subscription Limit** - Max beds based on your plan (e.g., 20, 50, 100 beds)
- 🏷️ **BED Prefix** - Frontend auto-adds "BED" (e.g., "1" becomes "BED1")
- 💰 **Bed Price** - Set monthly rent when creating bed
- 🔒 **Bed Number Lock** - Once tenant assigned, bed number is permanent
- 🟢🟡🔴 **Occupancy Tracking** - Real-time status based on active tenants
- ⚠️ **Delete Order** - Must remove tenant → then delete bed
- 🗑️ **Soft Delete** - Deleted beds renamed to `BED1__DELETED__{id}`
- 📸 **S3 Cleanup** - Old photos auto-deleted when replaced or bed deleted

---

## 📁 Key Files Reference

**Frontend Layer:**
- `src/features/owner/screens/beds/BedsScreen.tsx` - Screen component for listing beds with occupancy status
- `src/features/owner/screens/beds/BedFormModal.tsx` - Modal form for adding and editing beds
- `src/features/owner/api/roomsApi.ts` - API service for bed CRUD operations

**Backend Layer:**
- `src/modules/bed/bed.controller.ts` - REST API endpoints definition
- `src/modules/bed/bed.service.ts` - Business logic, validation, and restrictions

**Database:**
- `prisma/schema.prisma` (beds model) - Database table structure definition

---

## 📞 Common Questions

**Q: Is there a limit on how many beds I can create?**  
A: Yes, based on your subscription plan. Error: "Bed limit reached. Your plan allows up to X beds."

**Q: Can I change bed number after assigning a tenant?**  
A: ❌ No. Bed number is locked forever once a tenant has been assigned (even if they moved out).

**Q: Can I move a bed to a different room?**  
A: ✅ Yes, you can change the room when editing (if bed number is not locked).

**Q: Can I delete a bed with an active tenant?**  
A: ❌ No. You must move the tenant out first.

**Q: What happens to photos when I delete a bed?**  
A: Photos are permanently deleted from S3 storage.

**Q: Can I set different prices for beds in the same room?**  
A: ✅ Yes, each bed has its own price (e.g., BED1 = ₹8000, BED2 = ₹7500).

**Q: How is occupancy status calculated?**  
A: 🟢 Available = No active tenant<br>🔴 Occupied = Active tenant assigned to bed

---

*Document Version: 1.0*  
*Last Updated: June 2026*
