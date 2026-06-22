# 🚪 Rooms Management

> **Simple Guide:** How PG Owners add and manage rooms in their PG locations

---

## 📋 What is a Room?

A **Room** is a space inside a PG location that contains beds for tenants. Each room has a unique number within a PG.

**Example:**
- Room 101, Room 102, Room 103
- Room A1, Room A2

---

## 🚀 What You Can Do

| Action | Description |
|--------|-------------|
| ➕ **Create** | Add a new room to a PG |
| 📋 **View** | See all rooms in a list |
| ✏️ **Edit** | Change room number or photos |
| 🗑️ **Delete** | Remove a room (soft delete) |

---

## 📱 Frontend Flow (Mobile App)

### Screen 1: Rooms List (`RoomsScreen.tsx`)

**What User Sees:**
```
┌─────────────────────────────┐
│  🚪 Rooms                   │
│  Green Valley PG            │
├─────────────────────────────┤
│                             │
│ 🔍 Search rooms...          │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🚪 Room 101             │ │
│ │    🛏️ 3 Beds            │ │
│ │    ✅ Available          │ │
│ │    [Edit] [Delete]       │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🚪 Room 102             │ │
│ │    🛏️ 2 Beds            │ │
│ │    🟡 Occupied           │ │
│ │    [Edit] [Delete]       │ │
│ └─────────────────────────┘ │
│                             │
│     [+ Add New Room]        │
│                             │
└─────────────────────────────┘
```

**Features:**
- 📋 List all rooms with bed count
- 🔍 Search by room number
- 🔄 Pull-to-refresh
- ✏️ Edit (if has permission)
- 🗑️ Delete (if has permission)
- ➕ Add new room

---

### Screen 2: Add/Edit Room (`CreateEditRoomModal.tsx`)

**Form Fields:**
```
┌─────────────────────────────┐
│  ➕ Add New Room            │
├─────────────────────────────┤
│                             │
│  Room Number *              │
│  [101        ]              │
│                             │
│  📸 Upload Photos           │
│  [📷] [📷] [📷]             │
│                             │
│  [    Save Room    ]        │
│                             │
└─────────────────────────────┘
```

**Field Details:**

- 🏷️ **Room Number** (Required) - A unique identifier for the room within the PG (e.g., "101", "A1"). Must be unique within the same PG location. Duplicate room numbers are not allowed

- 📸 **Photos** (Optional) - Room images for marketing and reference. Old images are automatically deleted from S3 when replaced with new ones

**Important:** Room number is **LOCKED** once beds are created. Cannot change it.

---

## 📋 Business Rules (Main Restrictions)

### When Creating a Room:

The system performs these validations before creating a room:

- 📊 **Subscription Limit Check** - The system counts your existing rooms against your plan limit. If you've reached the maximum: *"Room limit reached. Your plan allows up to X rooms"*

- 🔍 **Duplicate Room Number Check** - The system checks if the room number already exists in the same PG. If found: *"Room number 'X' already exists in this PG"*

- 🏷️ **RM Prefix Auto-Addition (Frontend)** - The frontend automatically adds "RM" prefix if not present. For example, entering "101" becomes "RM101"

### When Updating a Room:

Before applying updates, the system checks:

- 🔒 **Room Number Lock** - The system counts beds in this room. If any beds exist, the room number cannot be changed: *"Room number cannot be changed once beds are created for this room"*

- 📸 **S3 Image Cleanup** - If you're updating photos, the system automatically deletes old images from S3 storage to save space

### When Deleting a Room:

The system performs strict checks before allowing deletion:

- 🛏️ **Beds Existence Check** - The system counts beds in this room. If any exist: *"Cannot delete room with beds. Delete beds first."*

- 🗑️ **Soft Delete** - If all checks pass, the room is soft deleted by:
  - Renaming to `Room__DELETED__{id}` format
  - Marking `is_deleted = true`
  - This preserves historical data while hiding from active lists

- 📸 **S3 Images Cleanup** - All associated images are permanently deleted from S3 storage

### When Viewing Rooms:

When fetching the room list, the system applies these filters:

- 🏢 **PG Filter** - Only rooms belonging to the selected PG location are returned

- 🗑️ **Deleted Filter** - Soft-deleted rooms (where `is_deleted = true`) are automatically filtered out

- 🟢🔴 **Occupancy Status Calculation** - The system checks bed occupancy to determine room status:
  - Available = No active tenants in any bed
  - Occupied = At least one bed has an active tenant

---

## ⚙️ Backend Logic

### API Endpoints:
```
Room Module
├── GET    /rooms              → List all rooms (with filters)
├── GET    /rooms/:id          → Get single room
├── POST   /rooms              → Create new room
├── PUT    /rooms/:id          → Update room
└── DELETE /rooms/:id          → Soft delete room
```

### Database Schema (rooms table):

**Core Columns:**
- `s_no` (INT, Primary Key) - Auto-increment unique identifier for the room
- `room_no` (VARCHAR) - Room number as displayed (e.g., "101", "A1", "RM101")

**Relationships:**
- `pg_id` (INT, Foreign Key) - Reference to the parent PG location

**Media & Deletion:**
- `images` (JSON) - Array of S3 image URLs for room photos
- `is_deleted` (BOOLEAN) - Soft delete flag for data preservation

### Relationships:
```
rooms
    ├── pg_locations (FK) → Parent PG
    └── beds (1:N) → Beds in this room
```

---

## 🔒 Permissions

**Role-Based Access:**

- **Super Admin** - Full access to all room operations:
  - ✅ View all rooms
  - ✅ Create new rooms
  - ✅ Edit existing rooms
  - ✅ Delete rooms

- **Admin** - Can manage but not delete:
  - ✅ View all rooms
  - ✅ Create new rooms
  - ✅ Edit existing rooms
  - ❌ Cannot delete rooms

- **Manager** - View-only access:
  - ✅ View all rooms
  - ❌ Cannot create rooms
  - ❌ Cannot edit rooms
  - ❌ Cannot delete rooms

- **Staff** - View-only access:
  - ✅ View all rooms
  - ❌ Cannot create rooms
  - ❌ Cannot edit rooms
  - ❌ Cannot delete rooms

**Permission Codes Used:**
- `VIEW_ROOM` - Permission to see room list and details
- `CREATE_ROOM` - Permission to add new rooms
- `EDIT_ROOM` - Permission to modify existing rooms
- `DELETE_ROOM` - Permission to remove rooms (soft delete)

---

## ⚠️ Error Handling

Common errors and how to resolve them:

- **"Room number already exists"**
  - **Cause:** Another room in the same PG already uses this number
  - **Solution:** Use a different, unique room number

- **"Room number cannot be changed"**
  - **Cause:** Trying to edit room number when beds already exist in this room
  - **Solution:** Room number is permanently locked once beds are created

- **"Cannot delete room"**
  - **Cause:** The room still has beds assigned to it
  - **Solution:** Delete all beds in this room first, then delete the room

- **"Room not found"**
  - **Cause:** Room was deleted or the ID doesn't exist
  - **Solution:** Refresh the room list to see current available rooms

---

## 💡 Key Points

- 📊 **Subscription Limit** - Max rooms based on your plan (e.g., 10, 50, 100 rooms)
- 🏷️ **RM Prefix** - Frontend auto-adds "RM" (e.g., "101" becomes "RM101")
- ✅ **Unique Room Numbers** - Cannot have two "101" rooms in same PG
- 🔒 **Room Number Lock** - Once beds are added, room number is permanent
- ⚠️ **Delete Order** - Must delete beds → then delete room
- 🗑️ **Soft Delete** - Deleted rooms renamed to `Room__DELETED__{id}`
- 📸 **S3 Cleanup** - Old photos auto-deleted when replaced or room deleted

---

## 📁 Key Files Reference

**Frontend Layer:**
- `src/features/owner/screens/rooms/RoomsScreen.tsx` - Screen component for listing rooms with occupancy status
- `src/features/owner/screens/rooms/CreateEditRoomModal.tsx` - Modal form for adding and editing rooms
- `src/features/owner/api/roomsApi.ts` - API service for room CRUD operations

**Backend Layer:**
- `src/modules/room/room.controller.ts` - REST API endpoints definition
- `src/modules/room/room.service.ts` - Business logic, validation, and restrictions

---

## 📞 Common Questions

**Q: Can I change room number after creating beds?**  
A: ❌ No. Room number is locked forever once beds are created.

**Q: Is there a limit on how many rooms I can create?**  
A: Yes, based on your subscription plan. Error: "Room limit reached. Your plan allows up to X rooms."

**Q: Can I have same room number in different PGs?**  
A: ✅ Yes. Room numbers are unique only within a PG.

**Q: Can I delete a room with beds?**  
A: ❌ No. Delete all beds first, then delete the room.

**Q: What happens to photos when I delete a room?**  
A: Photos are permanently deleted from S3 storage.

**Q: Can I restore a deleted room?**  
A: No direct restore. You must create a new room with same number.

---

*Document Version: 1.0*  
*Last Updated: June 2026*
