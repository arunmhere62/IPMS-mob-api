# 📚 IPMS Application Documentation

> **Integrated Property Management System - Business Logic & Flow Guides**

---

## 🎯 Purpose

This folder contains **human-readable documentation** explaining:
- How the application works (business logic)
- Step-by-step flows for each feature
- API endpoints with examples
- Database operations

**Designed for:**
- 👨‍💼 Business stakeholders
- 📊 Product managers
- 🧪 QA testers
- 👨‍💻 Developers (new to the project)
- 📞 Support staff

---

## 📖 Documentation Index

| # | Document | Description | Status |
|---|----------|-------------|--------|
| 01 | [PG Owner Registration](./01-pg-owner-registration.md) | How new PG owners sign up | ✅ Complete |
| 02 | [PG Locations](./02-pg-locations.md) | Managing PG buildings/locations | ✅ Complete |
| 03 | [Rooms](./03-rooms.md) | Managing rooms in PGs | ✅ Complete |
| 04 | [Beds](./04-beds.md) | Managing beds in rooms | ✅ Complete |
| 05 | [Tenant Registration](./05-tenant-registration.md) | How tenants are added | ✅ Complete |
| 06 | [Rent Cycles & Allocations](./06-rent-cycles.md) | How rent cycles work and tenant allocations | ✅ Complete |
| 07 | [Tickets & Support](./07-tickets-support.md) | Tenant complaints and chat | 📝 Coming Soon |
| 08 | [User Roles & Permissions](./08-roles-permissions.md) | Who can do what | 📝 Coming Soon |

---

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      IPMS APPLICATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Owner App  │  │  Tenant App  │  │   Admin Web  │           │
│  │   (Mobile)   │  │   (Mobile)   │  │   (Web)      │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                  ┌────────▼────────┐                          │
│                  │   Backend API   │                          │
│                  │   (NestJS)      │                          │
│                  └────────┬────────┘                          │
│                           │                                     │
│                  ┌────────▼────────┐                          │
│                  │   Database      │                          │
│                  │   (MySQL)       │                          │
│                  └─────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Concepts

### 👥 User Types

| User Type | Description | Access Level |
|-----------|-------------|--------------|
| **Super Admin** | PG Owner | Full access to their organization |
| **Admin** | Staff/Manager appointed by Owner | Limited access based on permissions |
| **Tenant** | Person renting a bed/room | Can view their info, pay rent, raise tickets |
| **System Admin** | Platform administrator | Can manage all organizations |

### 🏢 Organization Structure

```
Organization (e.g., "Green Valley PG")
    ├── PG Locations (e.g., "Koramangala Branch")
    │       ├── Rooms
    │       │     └── Beds
    │       └── Tenants
    ├── Users (Owners, Admins, Staff)
    └── Settings (Rent cycles, Rules)
```

### 💰 Rent Cycle Types

| Type | Description | Use Case |
|------|-------------|----------|
| **CALENDAR** | 1st to last day of month | Standard monthly rent |
| **MIDMONTH** | Custom dates (e.g., 15th-14th) | Bi-weekly or custom cycles |

---

## 🌐 API Base URLs

| Environment | URL |
|-------------|-----|
| **Development** | `http://localhost:3000/api/v1` |
| **Staging** | `https://staging-api.ipms.com/api/v1` |
| **Production** | `https://api.ipms.com/api/v1` |

---

## 📝 How to Read API Documentation

Each API section includes:

```
📌 ENDPOINT: POST /auth/signup
📝 DESCRIPTION: What this API does
📤 REQUEST: JSON body example
📥 RESPONSE: Success response
❌ ERRORS: Possible error messages
```

---

## 🔒 Authentication

Most APIs require authentication via **JWT Token**:

```http
Authorization: Bearer <access_token>
```

**Getting a Token:**
1. Login with phone number
2. Verify OTP
3. Receive `accessToken` and `refreshToken`
4. Use `accessToken` in all subsequent requests

---

## 🆘 Common HTTP Status Codes

| Code | Meaning | When You See It |
|------|---------|-----------------|
| **200** | OK | Request successful |
| **201** | Created | New record created (signup, add tenant) |
| **400** | Bad Request | Missing or invalid data |
| **401** | Unauthorized | Not logged in or token expired |
| **403** | Forbidden | No permission for this action |
| **404** | Not Found | Record doesn't exist |
| **500** | Server Error | Something went wrong on backend |

---

## 📞 Support & Updates

- **Questions?** Contact the development team
- **Found an error?** Create a ticket in the project management tool
- **Need new documentation?** Request via email/Slack

---

*Documentation Version: 1.0*  
*Last Updated: June 2026*
