# 👤 Tenant Registration

> **Simple Guide:** How PG Owners register and manage tenants

---

## 📋 What is a Tenant?

A **Tenant** is a person who rents a bed in your PG. Each tenant gets a unique ID and can be tracked for rent payments, status, and history.

**Key Information Stored:**
- Personal details (name, phone, WhatsApp, email)
- Accommodation (PG, Room, Bed)
- Check-in/Check-out dates
- Photos and ID proof documents
- Payment history and rent status

---

## 🚀 What You Can Do

| Action | Description |
|--------|-------------|
| ➕ **Register** | Add a new tenant to a bed |
| 📋 **View** | See all tenants with rent status |
| ✏️ **Edit** | Update tenant details |
| 🗑️ **Delete** | Remove tenant (strict conditions) |
| 🔄 **Transfer** | Move tenant to different PG/Room/Bed |
| 🏁 **Checkout** | Mark tenant as checked out |

---

## 📱 Frontend Flow (Mobile App)

### Screen 1: Tenants List (`TenantsScreen.tsx`)

**What User Sees:**
```
┌─────────────────────────────┐
│  👤 Tenants                 │
│  Green Valley PG            │
├─────────────────────────────┤
│                             │
│ 🔍 Search tenants...        │
│ [All] [Active] [Inactive]   │
│                             │
│ ┌─────────────────────────┐ │
│ │ 👤 Rajesh Kumar        │ │
│ │    🛏️ 101 - BED1        │ │
│ │    ✅ Rent Paid         │ │
│ │    📞 +91 98765...      │ │
│ │    [View] [Edit]        │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 👤 Priya Sharma        │ │
│ │    🛏️ 102 - BED2        │ │
│ │    ⚠️ Pending ₹3,000   │ │
│ │    📅 Due: 5 days ago   │ │
│ │    [Collect Rent]       │ │
│ └─────────────────────────┘ │
│                             │
│     [+ Add Tenant]          │
│                             │
└─────────────────────────────┘
```

**Features:**
- 📋 List all tenants with rent status
- 🟢🟡🔴 Payment status: Paid / Partial / Pending
- 🔍 Search by name
- 🏠 Filter by room/bed
- 📊 Summary: Total pending rent, partial payments count
- ➕ Add new tenant

---

### Screen 2: Add/Edit Tenant (`AddTenantScreen.tsx`)

**Form Fields:**
```
┌─────────────────────────────┐
│  ➕ Register New Tenant     │
├─────────────────────────────┤
│                             │
│  👤 Personal Information    │
│  ─────────────────────────  │
│  Full Name *                │
│  [Rajesh Kumar     ]        │
│                             │
│  Phone Number *             │
│  [+91 9876543210   ]        │
│                             │
│  WhatsApp Number            │
│  [+91 9876543210   ]        │
│                             │
│  Email                      │
│  [raj@email.com    ]        │
│                             │
│  🏠 Accommodation           │
│  ─────────────────────────  │
│  Room *                     │
│  [▼ Room 101            ]   │
│                             │
│  Bed *                      │
│  [▼ BED1 (Available)    ]   │
│                             │
│  Check-in Date *            │
│  [📅 2026-06-01     ]       │
│                             │
│  Check-out Date (Optional)  │
│  [📅 Not set          ]      │
│                             │
│  📸 Documents               │
│  ─────────────────────────  │
│  [📷] [📷] Tenant Photos    │
│  [📄] ID Proof Document     │
│                             │
│  [  Register Tenant  ]      │
│                             │
└─────────────────────────────┘
```

**Field Details:**

- 👤 **Full Name** (Required) - Tenant's complete name
- 📱 **Phone** (Required) - Primary contact number for communication
- 💬 **WhatsApp** (Optional) - WhatsApp number for messages (defaults to phone if not provided)
- 📧 **Email** (Optional) - Email address for notifications and receipts
- 🏠 **Room** (Required) - Select an available room from the PG
- 🛏️ **Bed** (Required) - Select an available bed that is currently unoccupied
- 📅 **Check-in** (Required) - The date when tenant moves in
- 📅 **Check-out** (Optional) - Expected move-out date if known in advance

**Important Edit Restrictions:**
Once a tenant has ANY payment (rent, advance, refund) or bills, the following fields become **LOCKED**:
- ❌ Check-in Date
- ❌ Room
- ❌ Bed

This is called `lockTenancyFacts` in the frontend.

---

## 📋 Business Rules (Main Restrictions)

### When Creating a Tenant:

The system performs these validations before creating a tenant:

- 📊 **Subscription Limit Check** - The system counts your current active tenants and compares against your plan limit. If you've reached the maximum allowed tenants, the creation is blocked with error: *"Tenant limit reached. Your plan allows up to X tenants"*

- 🏢 **PG Location Verification** - The system verifies the selected PG location exists and belongs to your organization. If not found, you get: *"PG Location with ID X not found"*

- 🚪 **Room Verification** - The system checks that the selected room exists in the PG. If the room doesn't exist: *"Room with ID X not found"*

- 🛏️ **Bed Verification** - The system confirms the selected bed exists in the room. If the bed doesn't exist: *"Bed with ID X not found"*

- 🔒 **Bed Occupancy Check** - The system queries for any ACTIVE tenant already assigned to this bed. If someone is occupying it: *"Bed with ID X is already occupied"*

- 🏷️ **Unique Tenant ID Generation** - If all validations pass, the system auto-generates a unique tenant ID in format: **TNT-XXXXXX** (e.g., TNT-001234)

### When Updating a Tenant:

Before applying updates, the system checks:

- 🔒 **Tenancy Facts Lock** - The system checks if the tenant has ANY payment history (rent payments, advance payments, refund payments) or any bills. If ANY of these exist, the following fields become permanently locked:
  - ❌ Check-in Date - Cannot be modified
  - ❌ Room - Cannot be changed
  - ❌ Bed - Cannot be changed
  
  Error message: *"Once rent is generated or any payment exists, Check-in date, Room, and Bed cannot be changed. Please contact support if you need to make this change."*

- 📅 **Date Format Validation** - Both check-in and check-out dates must be valid date formats. Invalid dates result in: *"Invalid check-in date"* or *"Invalid check-out date"*

- 📆 **Date Logic Check** - Check-in date must be the same as or before check-out date. Violation shows: *"Check-in date must be the same as or before check-out date"*

- 🛏️ **New Bed Occupancy Check** - If changing the bed, the system verifies the new bed is not occupied by another ACTIVE tenant. If occupied: *"Bed with ID X is already occupied"*

- 📸 **S3 Image Cleanup** - If you're updating photos, the system automatically deletes old images from S3 storage to save space.

### When Deleting a Tenant:

Delete is only allowed for mistake corrections (tenant added by error). The system performs strict checks:

- ✅ **Status Check** - Only ACTIVE tenants can be deleted. If status is INACTIVE: *"Cannot delete tenant. Only ACTIVE tenants can be deleted."*

- ✅ **Checkout Check** - Tenants who have already checked out cannot be deleted. If check_out_date exists: *"Cannot delete tenant. Checked out tenants cannot be deleted."*

- 💰 **Rent Payments Check** - If any rent payments exist for this tenant: *"Cannot delete tenant. Rent payment exists for this tenant."*

- 💰 **Advance Payments Check** - If any advance payments exist: *"Cannot delete tenant. Advance payment exists for this tenant."*

- 💰 **Refund Payments Check** - If any refund payments exist: *"Cannot delete tenant. Refund payment exists for this tenant."*

- 🧾 **Bills Check** - If any current bills exist: *"Cannot delete tenant. Bills exist for this tenant."*

- 🗑️ **Soft Delete** - If ALL checks pass, the tenant is soft deleted by marking `is_deleted = true` rather than permanent deletion. This preserves data integrity.

### When Transferring a Tenant:

Transfer moves a tenant to a different PG, Room, or Bed within the same organization:

- ✅ **Tenant Status Check** - Only ACTIVE tenants can be transferred. If INACTIVE: *"Only ACTIVE tenants can be transferred."*

- 📅 **Effective Date Validation** - The transfer effective date must be a valid date. If invalid: *"Invalid effective_from date"*

- 📆 **Date Logic** - Effective date cannot be before the tenant's original check-in date. Violation shows: *"Invalid effective_from date. It cannot be before tenant check-in date (YYYY-MM-DD)."*

- 🔄 **One Transfer Per Rent Cycle** - The system checks if a transfer already occurred in the current rent cycle (based on PG's rent cycle settings). If already transferred: *"Tenant can be transferred only once per rent cycle."*

- 🏢 **Target PG Verification** - The target PG must exist and belong to your organization. If not found: *"PG Location with ID X not found"*

- 🚪 **Target Room Verification** - The target room must exist in the target PG. If not found: *"Room with ID X not found in PG Y"*

- 🛏️ **Target Bed Verification** - The target bed must exist in the target room and PG. If not found: *"Bed with ID X not found in room Y and PG Z"*

- 🔒 **Target Bed Occupancy** - The target bed must not be occupied by another ACTIVE tenant. If occupied: *"Selected bed is already occupied by another active tenant (Name)."*

- 📝 **Allocation History Creation** - On successful transfer, the system creates a record in `tenant_allocations` table tracking:
  - Effective from date
  - Effective to date (if ended)
  - Bed price snapshot (for historical rent calculation)

---

## ⚙️ Backend Logic

### API Endpoints:
```
Tenant Module
├── GET    /tenants              → List all tenants (with filters)
├── GET    /tenants/:id          → Get single tenant details
├── POST   /tenants              → Create new tenant
├── PUT    /tenants/:id          → Update tenant
├── DELETE /tenants/:id          → Soft delete tenant
├── POST   /tenants/:id/transfer  → Transfer tenant to new PG/Room/Bed
└── POST   /tenants/:id/checkout  → Checkout tenant
```

### Database Schema (tenants table):

| Column | Type | Description |
|--------|------|-------------|
| `s_no` | INT (PK) | Unique ID |
| `tenant_id` | VARCHAR | Unique tenant code (e.g., "TNT-001234") |
| `name` | VARCHAR | Tenant full name |
| `phone_no` | VARCHAR | Primary phone |
| `whatsapp_number` | VARCHAR | WhatsApp number |
| `email` | VARCHAR | Email address |
| `pg_id` | INT (FK) | Assigned PG |
| `room_id` | INT (FK) | Assigned room |
| `bed_id` | INT (FK) | Assigned bed |
| `check_in_date` | DATE | Move-in date |
| `check_out_date` | DATE | Move-out date |
| `status` | ENUM | ACTIVE / INACTIVE |
| `images` | JSON | Tenant photos |
| `proof_documents` | JSON | ID documents |
| `is_deleted` | BOOLEAN | Soft delete flag |

### Relationships:
```
tenants
    ├── pg_locations (FK) → Assigned PG
    ├── rooms (FK) → Assigned room
    ├── beds (FK) → Assigned bed
    ├── tenant_allocations (1:N) → Transfer history
    ├── tenant_rent_cycles (1:N) → Rent cycles
    ├── rent_payments (1:N) → Rent payments
    ├── advance_payments (1:N) → Advance payments
    └── current_bills (1:N) → Utility bills
```

---

## 🔒 Permissions

| Role | View | Create | Edit | Delete | Transfer | Checkout |
|------|------|--------|------|--------|----------|----------|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Staff** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Codes:**
- `VIEW_TENANT`
- `CREATE_TENANT`
- `EDIT_TENANT`
- `DELETE_TENANT`
- `TRANSFER_TENANT`
- `CHECKOUT_TENANT`

---

## ⚠️ Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Tenant limit reached" | Subscription plan limit | Upgrade plan |
| "Bed is already occupied" | Bed has active tenant | Select available bed |
| "Once rent is generated..." | Trying to change locked fields | Contact support |
| "Cannot delete tenant" | Payments/bills exist | Checkout instead of delete |
| "Only ACTIVE tenants can be transferred" | Tenant is INACTIVE | Cannot transfer |
| "One transfer per rent cycle" | Already transferred this cycle | Wait for next cycle |

---

## 💡 Key Points

- 📊 **Subscription Limit** - Max tenants based on your plan (e.g., 10, 50, 100 tenants)
- 🔒 **Tenancy Facts Lock** - Check-in, Room, Bed locked forever once any payment exists
- 🏷️ **Unique Tenant ID** - Auto-generated format: TNT-XXXXXX
- 🛏️ **Bed Occupancy** - One bed = One active tenant only
- 🔄 **Transfer History** - All transfers tracked in tenant_allocations table
- 📅 **Rent Cycle Check** - Can only transfer once per rent cycle
- 🗑️ **Delete vs Checkout** - Delete only for mistakes (no payments); Checkout for actual move-outs
- 📸 **S3 Cleanup** - Old photos auto-deleted when replaced

---

## 📁 Key Files Reference

| Layer | File Path | Purpose |
|-------|-----------|---------|
| **Frontend Screen** | `src/features/owner/screens/tenants/TenantsScreen.tsx` | List tenants with status |
| **Frontend Screen** | `src/features/owner/screens/tenants/AddTenantScreen.tsx` | Register/Edit tenant |
| **Frontend Screen** | `src/features/owner/screens/tenants/TenantDetailsScreen.tsx` | View tenant details |
| **Frontend API** | `src/features/owner/api/tenantsApi.ts` | API calls |
| **Backend Controller** | `src/modules/tenant/tenant.controller.ts` | API endpoints |
| **Backend Service** | `src/modules/tenant/tenant.service.ts` | Business logic |
| **Backend Service** | `src/modules/tenant/checkout/checkout.service.ts` | Checkout logic |

---

## 📞 Common Questions

**Q: Is there a limit on how many tenants I can register?**  
A: Yes, based on subscription plan. Error: "Tenant limit reached. Your plan allows up to X tenants."

**Q: Can I change the room or bed after registering a tenant?**  
A: ✅ Yes, if no payments/bills yet.<br>❌ No, if any payment exists (rent, advance, refund, bills).

**Q: Can I delete a tenant?**  
A: ❌ Only if:<br>- Status is ACTIVE<br>- Never checked out<br>- No payments (rent, advance, refund)<br>- No bills<br>Otherwise, use **Checkout** instead.

**Q: What's the difference between Delete and Checkout?**  
A: **Delete** = Mistake correction (no history).<br>**Checkout** = Tenant moved out (keeps payment history).

**Q: Can I transfer a tenant to a different PG?**  
A: ✅ Yes, if:<br>- Tenant is ACTIVE<br>- Target bed is available<br>- Only one transfer per rent cycle

**Q: What is "lockTenancyFacts"?**  
A: Frontend flag that locks Check-in, Room, Bed fields once tenant has any payment or bill.

**Q: Can two tenants share a bed?**  
A: ❌ No. System enforces one active tenant per bed.

---

*Document Version: 1.0*  
*Last Updated: June 2026*
