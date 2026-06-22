# 🏠 PG Locations Management

> **Simple Guide:** How PG Owners add and manage their PG building locations

---

## 📋 What is a PG Location?

A **PG Location** is a physical building where tenants stay. One owner can have multiple PGs (different areas or branches).

**Example:**
- "Green Valley PG - Koramangala"
- "Green Valley PG - Whitefield"

---

## 🚀 What You Can Do

| Action | Description |
|--------|-------------|
| ➕ **Create** | Add a new PG building |
| 📋 **View** | See all your PGs in a list |
| ✏️ **Edit** | Change PG details (name, address, type) |
| 🗑️ **Delete** | Remove a PG (soft delete) |

---

## 📱 Frontend Flow (Mobile App)

### Screen 1: PG Locations List (`PGLocationsScreen.tsx`)

**What User Sees:**
```
┌─────────────────────────────┐
│  🏠 My PG Locations         │
├─────────────────────────────┤
│                             │
│ 🔍 Search locations...      │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🏠 Green Valley PG      │ │
│ │    Koramangala           │ │
│ │    📍 Bangalore, KA      │ │
│ │    ✅ ACTIVE             │ │
│ │    🏘️ Co-living         │ │
│ │    [Edit] [Delete]       │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🏠 Green Valley PG      │ │
│ │    Whitefield            │ │
│ │    📍 Bangalore, KA      │ │
│ │    ✅ ACTIVE             │ │
│ │    👨 Men's PG          │ │
│ └─────────────────────────┘ │
│                             │
│     [+ Add New Location]    │
│                             │
└─────────────────────────────┘
```

**Features:**
- 📋 List all PGs with cards
- 🔍 Search by name or address
- 🔄 Pull-to-refresh
- ✏️ Edit (if has permission)
- 🗑️ Delete (soft delete)
- ➕ Add new PG location

---

### Screen 2: Add/Edit PG Location (Modal/Form)

**Form Fields:**
```
┌─────────────────────────────┐
│  ➕ Add New PG Location     │
├─────────────────────────────┤
│                             │
│  PG Name *                  │
│  [Green Valley PG...]       │
│                             │
│  Address *                  │
│  [123 Main Street...]       │
│                             │
│  Pincode                    │
│  [560001    ]               │
│                             │
│  State *                    │
│  [▼ Karnataka           ]   │
│                             │
│  City *                     │
│  [▼ Bangalore           ]   │
│                             │
│  PG Type *                  │
│  (○) Co-living             │
│  ( ) Men's PG              │
│  ( ) Women's PG            │
│                             │
│  Rent Cycle Type            │
│  (○) Calendar (1-30)       │
│  ( ) Mid-Month             │
│                             │
│  📸 Upload Photos           │
│  [📷] [📷] [📷]             │
│                             │
│  [   Save Location   ]      │
│                             │
└─────────────────────────────┘
```

**Field Details:**

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| 🏷️ **PG Name** | Yes | Display name for the location | "Green Valley PG - Koramangala" |
| 📍 **Address** | Yes | Full street address | "123, 4th Main Road" |
| 📮 **Pincode** | No | Postal code | "560001" |
| 🗺️ **State** | Yes | Indian state | "Karnataka" |
| 🏙️ **City** | Yes | City name | "Bangalore" |
| 🏘️ **PG Type** | Yes | Target audience | "COLIVING" / "MENS" / "WOMENS" |
| 📅 **Rent Cycle** | No | Billing cycle type | "CALENDAR" / "MIDMONTH" |
| 📸 **Photos** | No | PG images for display | S3 uploaded images |

---

### Screen 3: PG Location Details

**What User Sees:**
```
┌─────────────────────────────┐
│  ← Green Valley PG          │
│     Koramangala              │
├─────────────────────────────┤
│                             │
│  📸 [PG Photos Gallery]      │
│                             │
│  📍 Address                 │
│     123, 4th Main Road       │
│     Koramangala, Bangalore   │
│     Karnataka - 560001       │
│                             │
│  ⚙️ PG Settings             │
│  • Type: Co-living          │
│  • Rent Cycle: Calendar     │
│  • Status: Active           │
│                             │
│  [  Edit PG Details  ]      │
│                             │
└─────────────────────────────┘
```

---

## ⚙️ Backend Logic

### API Endpoints Structure

```
PG Locations Module
├── GET    /pg-locations              → List all PGs
├── GET    /pg-locations/:id          → Get single PG
├── GET    /pg-locations/:id/details  → Get detailed PG info
├── POST   /pg-locations              → Create new PG
├── PUT    /pg-locations/:id          → Update PG
└── DELETE /pg-locations/:id          → Soft delete PG
```

### Create PG Location Flow

```
1. User fills form → Clicks "Save"
        ↓
2. Frontend validates fields
        ↓
3. POST /pg-locations
        ↓
4. Backend validates:
   ├── Check organization exists
   ├── Validate state/city IDs
   └── Check permissions (CREATE_PG_LOCATION)
        ↓
5. INSERT into pg_locations table
        ↓
6. Return success with new PG ID
        ↓
7. Frontend adds to list
```

### Database Schema (pg_locations table)

**Core Columns:**
- `s_no` (INT, Primary Key) - Auto-increment unique identifier for the PG
- `location_name` (VARCHAR) - Display name of the PG location shown in UI
- `address` (VARCHAR) - Complete street address of the PG
- `pincode` (VARCHAR) - Postal/ZIP code for the location

**Location References:**
- `city_id` (INT, Foreign Key) - Reference to cities table for city information
- `state_id` (INT, Foreign Key) - Reference to states table for state information

**Organization & Status:**
- `organization_id` (INT, Foreign Key) - Reference to the owner organization
- `status` (ENUM) - Current operational status: ACTIVE or INACTIVE

**Configuration:**
- `pg_type` (ENUM) - Type of PG accommodation: COLIVING, MENS, or WOMENS
- `rent_cycle_type` (ENUM) - Billing cycle type: CALENDAR (monthly) or MIDMONTH (custom)
- `rent_cycle_start` (INT) - Cycle start day (1-31)
- `rent_cycle_end` (INT) - Cycle end day (1-31)

**Media & Deletion:**
- `images` (JSON) - Array of S3 image URLs for PG marketing photos
- `is_deleted` (BOOLEAN) - Soft delete flag for data preservation


## 🔒 Permissions & Access Control

**Role-Based Access:**

- **Super Admin** - Full access to all PG operations:
  - ✅ View all PG locations
  - ✅ Create new PG locations
  - ✅ Edit existing PG locations
  - ✅ Delete PG locations

- **Admin** - Can manage but not delete:
  - ✅ View all PG locations
  - ✅ Create new PG locations
  - ✅ Edit existing PG locations
  - ❌ Cannot delete PG locations

- **Manager** - View-only access:
  - ✅ View all PG locations
  - ❌ Cannot create PG locations
  - ❌ Cannot edit PG locations
  - ❌ Cannot delete PG locations

- **Staff** - View-only access:
  - ✅ View all PG locations
  - ❌ Cannot create PG locations
  - ❌ Cannot edit PG locations
  - ❌ Cannot delete PG locations

**Permission Codes Used:**
- `VIEW_PG_LOCATION` - Permission to see PG list and details
- `CREATE_PG_LOCATION` - Permission to add new PG locations
- `EDIT_PG_LOCATION` - Permission to modify existing PG locations
- `DELETE_PG_LOCATION` - Permission to remove PG locations (soft delete)

---


## ⚠️ Error Handling

Common errors and how to resolve them:

- **"Location name required"**
  - **Cause:** The PG name field was left empty
  - **Solution:** Enter a name for your PG location

- **"Invalid state/city"**
  - **Cause:** State or city ID doesn't exist in the database
  - **Solution:** Select valid options from the dropdown menus

- **"Permission denied"**
  - **Cause:** Your role doesn't have CREATE or EDIT permission
  - **Solution:** Contact your Super Admin to request access

- **"PG not found"**
  - **Cause:** PG was deleted or the ID doesn't belong to your organization
  - **Solution:** Refresh the PG list to see current available PGs

- **"Upload failed"**
  - **Cause:** Network issue or S3 service problem
  - **Solution:** Check your internet connection and retry the image upload

---

## 🔄 Rent Cycle Configuration

### Calendar Month (Default)
```
Rent Cycle: 1st to last day of month
Example: Jan 1 → Jan 31
Use when: Standard monthly rent
```

### Mid-Month Cycle
```
Rent Cycle: Custom date range
Example: 15th to 14th of next month
Use when: Bi-weekly or specific move-in dates
Settings: rent_cycle_start + rent_cycle_end
```

---

## � Business Rules (Backend Checks)

### When Creating a PG:

The system performs these validations when creating a new PG location:

- 📊 **Subscription Limit Check** - The system counts your existing PG locations against your plan limit. If you've reached the maximum: *"PG location limit reached. Your plan allows up to X PG locations"*

- 👤 **Auto-Assign Owner** - The creator is automatically set as the PG owner in the `pg_users` table with full permissions

- 📅 **Default Values Applied** - If not specified, the system sets:
  - Rent cycle type = CALENDAR
  - PG type = COLIVING

- ✅ **Required Fields Validation (Frontend)** - The following fields are mandatory:
  - Location Name - *"Please enter PG location name"*
  - Address - *"Please enter address"*
  - State - Must be selected from dropdown
  - City - Must be selected from dropdown

### When Updating a PG:

Before applying updates, the system checks:

- 📅 **Rent Cycle Change Lock** - The system counts existing rent payments for this PG. If any payments exist, rent cycle cannot be changed: *"Cannot change rent cycle type. X rent payment(s) already exist for this PG location"*

- 📸 **S3 Image Cleanup** - If you're updating photos, the system automatically deletes old images from S3 storage to save space

- 🔍 **Existence Check** - The PG must exist and belong to your organization. If not found: *"PG location not found"*

### When Deleting a PG:

The system performs strict checks before allowing deletion:

- 🏢 **Last PG Check** - Organization must have at least one PG. If this is the only PG: *"Cannot delete the last PG location of the organization"*

- 🚪 **Rooms Existence Check** - The system counts rooms in this PG. If any exist: *"Cannot delete PG location. It has X room(s) associated with it"*

- 🗑️ **Soft Delete** - If all checks pass, the PG is soft deleted by marking `is_deleted = true` rather than permanent deletion. This preserves historical data.

### When Viewing PGs:

When fetching the PG list, the system applies these filters:

- 🏢 **Organization Filter** - Only PGs belonging to the user's organization are returned. PGs from other organizations are never visible

- 🗑️ **Deleted Filter** - Soft-deleted PGs (where `is_deleted = true`) are automatically filtered out from the list

- ❌ **Not Found Handling** - If a specific PG ID is requested but doesn't exist or belongs to another organization, a *"PG location not found"* error is returned

---

## 📁 Key Files Reference

**Frontend Layer:**
- `src/features/owner/screens/pg-locations/PGLocationsScreen.tsx` - Screen component for listing and managing PG locations
- `src/features/owner/api/pgLocationsApi.ts` - API service for PG location CRUD operations
- `src/features/owner/store/slices/pgLocationSlice.ts` - Redux state management for PG locations

**Backend Layer:**
- `src/modules/pg-location/pg-location.controller.ts` - REST API endpoints definition
- `src/modules/pg-location/pg-location.service.ts` - Business logic and validation

**Database:**
- `prisma/schema.prisma` (pg_locations model) - Database table structure definition

---

## � Key Points

- 📊 **Subscription Limit** - Max PG locations based on your plan (e.g., 1, 5, 10 PGs)
- ✅ **One Owner = Many PGs** - Manage multiple buildings from one account
- ✅ **Photos** - Upload up to 2 PG images for marketing
- ⚠️ **Rent Cycle Lock** - Can't change after tenants have paid rent
- ⚠️ **Delete Restrictions** - Can't delete if rooms exist or if it's your only PG

---

## �� Common Questions

**Q: Is there a limit on how many PGs I can create?**  
A: Yes, based on your subscription plan. Error: "PG location limit reached. Your plan allows up to X PG locations."

**Q: Who becomes the owner when I create a PG?**  
A: You (the creator) are automatically set as the PG owner.

**Q: Can I change rent cycle after creating a PG?**  
A: ✅ Yes, if no rent payments yet.<br>❌ No, if tenants have paid.

**Q: Can I delete a PG that has rooms?**  
A: ❌ No. Delete all rooms first.

**Q: Can I delete my only PG?**  
A: ❌ No. Organization needs at least one PG.

**Q: What happens to old photos when I update PG?**  
A: Old images are automatically deleted from S3 when replaced.

**Q: Can I have Men's and Women's PGs?**  
A: Yes, create separate PGs with different pg_type values.

---

*Document Version: 1.0*  
*Last Updated: June 2026*
