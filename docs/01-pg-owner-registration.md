# 🏠 PG Owner Registration Flow

> **Simple Guide:** How a new PG (Paying Guest) Owner signs up and gets started

---

## 📋 Overview

When a new PG Owner wants to use our IPMS (Indian PG Management System), they go through a **3-step registration process**:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1️⃣  Sign Up    │ ──► │ 2️⃣ OTP Verify   │ ──► │ 3️⃣ Start Using  │
│  (Enter Details) │     │  (Phone Verify)  │     │  (Account Ready) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 🚀 Step-by-Step Process

### Step 1: Enter Registration Details 📱

**What the Owner Does:**
- Opens the app and clicks "Register as PG Owner"
- Fills in a simple form with:

| Field | Example | Description |
|-------|---------|-------------|
| 🏢 **Organization Name** | "Green Valley PG" | The name of their PG business |
| 👤 **Your Name** | "Rajesh Kumar" | Owner's full name |
| 📞 **Phone Number** | "+91 98765 43210" | Mobile number with country code |
| 📧 **Email** (Optional) | "rajesh@email.com" | For notifications |
| 🔒 **Password** | "SecurePass123" | To login (min 6 characters) |
| 🏠 **PG Name** | "Green Valley PG - Koramangala" | First PG location name |

**What Happens Behind the Scenes:**
```
📤 Owner submits form
    ↓
🔍 System checks: Is phone/email already used?
    ↓
✅ If unique → Move to Step 2
❌ If exists → Show "Already registered" error
```

---

### Step 2: Verify Phone with OTP 🔐

**What the Owner Does:**
1. Receives a 4-digit OTP on their phone (e.g., "1234")
2. Enters the OTP in the app
3. Clicks "Verify"

**What Happens Behind the Scenes:**
```
📱 System sends SMS with 4-digit code
    ↓
⏱️ OTP is valid for 5 minutes (300 seconds)
    ↓
👤 Owner enters OTP
    ↓
✅ Match? → Account is created!
❌ Wrong? → "Invalid OTP" error (max 3 attempts)
```

**Test Mode (For Developers):**
- Phone ending in `8248449609` → Use OTP `5555`

---

### Step 3: Account Created & Ready! 🎉

**What Gets Created Automatically:**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  🏢 Organization Created                             │
│     └── Name: "Green Valley PG"                    │
│     └── Status: ACTIVE                             │
│                                                     │
│  👤 User Account Created                             │
│     └── Name: "Rajesh Kumar"                       │
│     └── Role: SUPER_ADMIN (Owner)                │
│     └── Status: ACTIVE                             │
│                                                     │
│  🏠 PG Location Created                              │
│     └── Name: "Green Valley PG - Koramangala"      │
│     └── Status: ACTIVE                             │
│                                                     │
│  💎 Free Trial Subscription                          │
│     └── Plan: FREE or TRIAL                        │
│     └── Duration: Based on plan (e.g., 30 days)  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Success Message:** "Account created successfully"

---

## 📱 Frontend Flow (Mobile App)

### Screen 1: Signup Form (`SignupScreenNew.tsx`)

**What User Sees:**
```
┌─────────────────────────────┐
│  🏠 Create PG Account       │
├─────────────────────────────┤
│                             │
│  PG/Organization Name *      │
│  [________________]         │
│                             │
│  Your Name *                │
│  [________________]         │
│                             │
│  Phone Number *             │
│  [🇮🇳 +91][__________]      │
│  [Send OTP] ← Button         │
│                             │
│  PG Location Name *          │
│  [________________]         │
│                             │
│  Rent Cycle Type             │
│  (○) Calendar (1-30)        │
│  ( ) Mid-Month               │
│                             │
│  ☑ I agree to Terms         │
│                             │
│     [  Register  ]          │
│                             │
└─────────────────────────────┘
```

**Field Details:**

| Field | Required | Validation |
|-------|----------|------------|
| 🏢 **PG/Organization Name** | Yes | Min 2 characters |
| 👤 **Your Name** | Yes | Min 2 characters |
| 📞 **Phone Number** | Yes | Country code + 10 digits |
| 🏠 **PG Location Name** | Yes | Min 2 characters |
| 📅 **Rent Cycle** | No | Defaults to CALENDAR |
| ☑️ **Terms Agreement** | Yes | Must accept legal docs |

---

### Screen 2: OTP Verification (`SignupOtpScreen.tsx`)

**Flow:**
```
User clicks "Send OTP"
    ↓
App calls API: POST /auth/send-signup-otp
    ↓
SMS delivered to phone
    ↓
Auto-navigate to OTP Screen
    ↓
User enters 4-digit code
    ↓
App calls API: POST /auth/verify-signup-otp
    ↓
✅ Verified → Return to Signup
```

**Features:**
- ⏱️ **Resend OTP** available after 30 seconds
- 📱 **Auto-fill** from SMS (if supported)
- 🔢 **4-digit input** boxes
- ⏳ **5-minute expiry** countdown

---

### Screen 3: Registration Complete

**What Happens:**
1. User taps "Register" button
2. App validates all fields
3. App checks required legal documents
4. App calls signup API
5. App auto-accepts legal documents
6. Shows success message
7. **Auto-redirects to Login screen**

```
┌─────────────────────────────┐
│         ✅ Success!         │
│                             │
│  Your PG account has been   │
│  created successfully!        │
│                             │
│  Organization: Green Valley │
│  PG Location: Koramangala   │
│                             │
│    [  Go to Login  ]        │
└─────────────────────────────┘
```

---

## ⚙️ Backend Logic (What Happens Behind the Scenes)

### API Sequence:
```
1. POST /auth/send-signup-otp
   ├── Validates phone format
   ├── Generates 4-digit OTP
   ├── Stores OTP in database (5 min expiry)
   └── Sends SMS via SMS service

2. POST /auth/verify-signup-otp
   ├── Checks phone + OTP match
   ├── Verifies OTP not expired
   └── Marks phone as verified

3. POST /auth/signup
   ├── Validates all fields
   ├── Checks phone already exists
   ├── TRANSACTION START (all-or-nothing)
   │   ├── Creates Organization
   │   ├── Creates User (role: SUPER_ADMIN)
   │   ├── Creates PG Location
   │   ├── Links User to PG (pg_users table)
   │   ├── Assigns Free/Trial Subscription
   │   └── Updates org with creator ID
   ├── TRANSACTION END
   └── Returns userId, orgId, pgId
```

### Database Operations (in transaction):

The registration process creates records across multiple tables in a single atomic transaction:

**Step 1: Organization Creation**
- **Table:** `organization`
- **Operation:** INSERT
- **Purpose:** Creates the PG business entity that owns all locations, rooms, and beds

**Step 2: User Account Creation**
- **Table:** `users`
- **Operation:** INSERT
- **Purpose:** Creates the owner/user account with SUPER_ADMIN role and login credentials

**Step 3: PG Location Creation**
- **Table:** `pg_locations`
- **Operation:** INSERT
- **Purpose:** Creates the first PG location (physical building) under the organization

**Step 4: Owner-PG Link**
- **Table:** `pg_users`
- **Operation:** INSERT
- **Purpose:** Links the user to the PG as owner with full permissions

**Step 5: Subscription Assignment**
- **Table:** `user_subscriptions`
- **Operation:** INSERT
- **Purpose:** Assigns the free or trial subscription plan to the organization

**Step 6: Organization Update**
- **Table:** `organization`
- **Operation:** UPDATE
- **Purpose:** Sets the creator/superadmin reference on the organization record

### Security Checks:
- ✅ Phone number uniqueness
- ✅ OTP verification required
- ✅ Legal documents acceptance
- ✅ All data validated before insert
- ✅ Transaction rollback on any failure

---

## ⚠️ Error Handling

Common errors during registration and their causes:

- **❌ "Email or phone already registered"**
  - **When It Happens:** The phone number or email is already in use by another account
  - **Solution:** Use a different phone number or email, or login if you already have an account

- **❌ "Invalid or expired OTP" (Invalid Code)**
  - **When It Happens:** The OTP entered doesn't match the sent code
  - **Solution:** Check the SMS carefully and re-enter the correct 4-digit code

- **❌ "Invalid or expired OTP" (Expired)**
  - **When It Happens:** More than 5 minutes have passed since OTP was sent
  - **Solution:** Click "Resend OTP" to get a new code

- **❌ "Free/trial subscription plan not found"**
  - **When It Happens:** System configuration issue - no default plan exists
  - **Solution:** Contact system administrator to set up subscription plans

- **❌ "ADMIN role not found in the system"**
  - **When It Happens:** Database setup issue - roles not initialized
  - **Solution:** Contact system administrator to initialize RBAC roles

---

## 📊 Database Tables Affected

When a PG Owner registers, these tables get new records:

1. **`organization`** - The PG business entity
2. **`users`** - The owner/user account
3. **`pg_locations`** - The first PG location
4. **`pg_users`** - Links user to PG (owner relationship)
5. **`user_subscriptions`** - Free/trial plan assignment
6. **`otp_verifications`** - OTP tracking (deleted after use)

---

## 🔄 Rent Cycle Settings

During registration, owners can set how rent is calculated:

- **CALENDAR** (Default)
  - **Description:** Standard monthly billing cycle from the 1st to the last day of each month
  - **Example:** January 1st to January 31st
  - **Use When:** Most common for standard monthly rent collection

- **MIDMONTH**
  - **Description:** Custom date range for flexible billing cycles
  - **Example:** 15th of current month to 14th of next month
  - **Use When:** Tenants move in mid-month or you prefer bi-weekly billing

**Default:** `CALENDAR` (if not specified)

---

## 🎯 Next Steps After Registration

Once registered, the PG Owner can:

1. **🏠 Add Rooms** → Create rooms in their PG
2. **🛏️ Add Beds** → Add beds to each room
3. **👥 Add Tenants** → Register tenants and assign beds
4. **💰 Set Rent** → Configure rent amounts
5. **📱 Manage** → Use the dashboard to manage everything

---

## 💡 Key Points for Non-Developers

- ✅ **No manual approval needed** - Account is active immediately
- ✅ **Free trial starts automatically** - Based on system configuration
- ✅ **One phone = One account** - Can't register same phone twice
- ✅ **Super Admin role** - Owner has full control over their PG
- ✅ **Multiple PGs possible** - Can add more locations after registration

---

## 📞 Support

If registration fails:
1. Check phone number format (should include country code like +91)
2. Ensure OTP entered within 5 minutes
3. Try resending OTP if not received
4. Contact admin if "Free plan not found" error

---

*Last Updated: June 2026*
*Module: Auth / Registration*
