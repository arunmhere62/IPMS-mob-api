# Tenant Portal Module

## Overview
This module provides a secure portal for tenants to access their PG information, view payments, and manage their account.

## Architecture

```
tenant-portal/
├── auth/                           # Tenant authentication
│   ├── dto/
│   │   ├── tenant-send-otp.dto.ts
│   │   ├── tenant-verify-otp.dto.ts
│   │   └── tenant-login-response.dto.ts
│   ├── tenant-auth.controller.ts  # Auth endpoints
│   └── tenant-auth.service.ts     # Auth logic
│
├── tenant-portal.controller.ts    # Main tenant endpoints
├── tenant-portal.service.ts       # Business logic
├── tenant-portal.module.ts        # Module definition
└── README.md
```

## API Endpoints

### Authentication (`/tenant/auth`)

#### 1. Send OTP
```http
POST /tenant/auth/send-otp
Content-Type: application/json

{
  "phone": "+919876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully to your registered phone number",
  "data": {
    "phone": "+919876543210",
    "expiresIn": 600
  }
}
```

#### 2. Verify OTP & Login
```http
POST /tenant/auth/verify-otp
Content-Type: application/json

{
  "phone": "+919876543210",
  "otp": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tenant": {
      "s_no": 1,
      "name": "John Doe",
      "phone": "+919876543210",
      "email": "john@example.com",
      "pg_id": 1,
      "room_id": 5,
      "bed_id": 12,
      "status": "ACTIVE"
    }
  }
}
```

#### 3. Refresh Token
```http
POST /tenant/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Tenant Portal (`/tenant`)
**All endpoints require Bearer token authentication**

#### 1. Get Profile
```http
GET /tenant/profile
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant": {
      "s_no": 1,
      "name": "John Doe",
      "phone": "+919876543210",
      "email": "john@example.com",
      "status": "ACTIVE",
      "check_in_date": "2024-01-01T00:00:00.000Z",
      "check_out_date": null
    },
    "pg": {
      "s_no": 1,
      "pg_name": "Green Valley PG",
      "address": "123 Main St",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560001"
    },
    "currentRoom": {
      "s_no": 5,
      "room_no": "101",
      "floor": 1
    },
    "currentBed": {
      "s_no": 12,
      "bed_no": "A"
    }
  }
}
```

#### 2. Get Payment History
```http
GET /tenant/payments?page=1&limit=20
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "s_no": 1,
        "tenant_id": 1,
        "amount": 5000,
        "payment_date": "2024-01-05T00:00:00.000Z",
        "payment_mode": "UPI",
        "status": "PAID"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    }
  }
}
```

#### 3. Get Pending Dues
```http
GET /tenant/dues
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDue": 5000,
    "unpaidCycles": [
      {
        "s_no": 1,
        "cycle_start": "2024-02-01T00:00:00.000Z",
        "cycle_end": "2024-02-29T00:00:00.000Z",
        "rent_amount": 5000,
        "due_amount": 5000,
        "payment_status": "UNPAID"
      }
    ]
  }
}
```

## Security

### Role-Based Access Control (RBAC)
- All tenant portal endpoints are protected by `@Roles(UserRole.TENANT)` decorator
- `RolesGuard` ensures only tenants can access these endpoints
- JWT tokens contain `role: 'TENANT'` claim

### Guards Applied
1. **JwtAuthGuard** - Validates JWT token
2. **RolesGuard** - Validates user role is TENANT

### JWT Payload Structure
```typescript
{
  sub: number,           // Tenant ID
  tenantId: number,      // Same as sub
  phone: string,         // Tenant phone
  role: 'TENANT',        // User role
  pgId: number,          // PG location ID
  roomId: number,        // Current room ID
  bedId: number,         // Current bed ID
  iat: number,           // Issued at
  exp: number            // Expiration
}
```

## Database Schema Requirements

### Required Fields in `tenants` table:
```sql
-- Optional: Add these fields for better tenant portal experience
ALTER TABLE tenants ADD COLUMN is_portal_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN last_login_at DATETIME;
ALTER TABLE tenants ADD COLUMN fcm_token VARCHAR(255);
```

### Existing `otp_verifications` table (already in your schema):
```sql
-- Table already exists with these fields:
-- s_no, user_id, phone, otp, is_verified, attempts, 
-- expires_at, created_at, updated_at, verified_at, ip_address, user_agent
-- No changes needed!
```

## Error Handling

### Common Error Responses

**404 - Tenant Not Found:**
```json
{
  "statusCode": 404,
  "message": "No tenant account found with this phone number. Please contact your PG owner.",
  "error": "Not Found"
}
```

**400 - Inactive Account:**
```json
{
  "statusCode": 400,
  "message": "Your account is INACTIVE. Please contact your PG owner.",
  "error": "Bad Request"
}
```

**401 - Invalid OTP:**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired OTP",
  "error": "Unauthorized"
}
```

**403 - Forbidden (Wrong Role):**
```json
{
  "statusCode": 403,
  "message": "Access denied. Required roles: TENANT",
  "error": "Forbidden"
}
```

## Integration with App Module

Add to `app.module.ts`:
```typescript
import { TenantPortalModule } from './modules/tenant-portal/tenant-portal.module';

@Module({
  imports: [
    // ... other modules
    TenantPortalModule,
  ],
})
export class AppModule {}
```

## Testing

### Manual Testing with cURL

**1. Send OTP:**
```bash
curl -X POST http://localhost:3000/tenant/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
```

**2. Verify OTP:**
```bash
curl -X POST http://localhost:3000/tenant/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "1234"}'
```

**3. Get Profile:**
```bash
curl -X GET http://localhost:3000/tenant/profile \
  -H "Authorization: Bearer <your_access_token>"
```

## Future Enhancements

### Planned Features:
1. **Ticket System** - Raise maintenance/complaint tickets
2. **Announcements** - View PG announcements
3. **Visitor Management** - Register visitors
4. **Expense Sharing** - View shared expenses
5. **Online Payments** - Pay rent through app
6. **Push Notifications** - Rent reminders, ticket updates

### Suggested Endpoints:
```
POST   /tenant/tickets              # Create ticket
GET    /tenant/tickets              # List my tickets
GET    /tenant/tickets/:id          # Get ticket details
PATCH  /tenant/tickets/:id          # Update ticket (add comment)

GET    /tenant/announcements        # View announcements
GET    /tenant/visitors             # My visitor history
POST   /tenant/visitors             # Register visitor

POST   /tenant/payments/initiate    # Initiate online payment
POST   /tenant/payments/verify      # Verify payment status
```

## Notes

- **Phone field**: The schema uses `phone_no` but auth service expects `phone`. You may need to adjust field names.
- **PrismaService path**: Update the import path to match your actual Prisma service location.
- **OTP Service**: Integrate with actual SMS provider (Twilio, AWS SNS, etc.) instead of console.log.
- **Tenant Status**: Only `ACTIVE` tenants can login. Adjust logic if needed.
