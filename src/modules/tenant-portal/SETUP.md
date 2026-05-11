# Tenant Portal Setup Guide

## ✅ All Files Created - No Schema Changes Needed!

The tenant portal module has been created and adapted to work with your **existing database schema**. No table modifications required!

## 📁 Files Created

```
src/
├── common/
│   ├── enums/
│   │   └── user-role.enum.ts          ✅ Role definitions
│   ├── decorators/
│   │   └── roles.decorator.ts         ✅ @Roles() decorator
│   └── guards/
│       └── roles.guard.ts             ✅ Role-based access control
│
└── modules/
    └── tenant-portal/
        ├── auth/
        │   ├── dto/
        │   │   ├── tenant-send-otp.dto.ts
        │   │   ├── tenant-verify-otp.dto.ts
        │   │   └── tenant-login-response.dto.ts
        │   ├── tenant-auth.controller.ts
        │   └── tenant-auth.service.ts
        ├── tenant-portal.controller.ts
        ├── tenant-portal.service.ts
        ├── tenant-portal.module.ts
        ├── README.md
        └── SETUP.md (this file)
```

## 🔧 Integration Steps

### 1. Add Module to App Module

Edit `src/app.module.ts`:

```typescript
import { TenantPortalModule } from './modules/tenant-portal/tenant-portal.module';

@Module({
  imports: [
    // ... your existing modules
    TenantPortalModule,  // ← Add this
  ],
})
export class AppModule {}
```

### 2. Update JWT Secret (Optional)

In `tenant-portal.module.ts`, update the JWT secret:

```typescript
JwtModule.register({
  secret: process.env.JWT_SECRET || 'your-secret-key',  // ← Use env variable
  signOptions: {
    expiresIn: '7d',
  },
}),
```

### 3. That's it! 🎉

No database changes needed. The module uses your existing:
- ✅ `tenants` table (with `phone_no` field)
- ✅ `tenant_allocations` table
- ✅ `rent_payments` table
- ✅ `tenant_rent_cycles` table
- ✅ `pg_locations` table
- ✅ `rooms` and `beds` tables
- ✅ `otp_verifications` table (for OTP login)

## 🚀 API Endpoints

### Authentication
```
POST /tenant/auth/send-otp          # Send OTP to tenant phone
POST /tenant/auth/verify-otp        # Verify OTP and login
POST /tenant/auth/refresh-token     # Refresh access token
```

### Tenant Portal (Protected)
```
GET  /tenant/profile                # Get tenant profile
GET  /tenant/payments?page=1        # Get payment history
GET  /tenant/dues                   # Get pending dues
```

## 🧪 Testing

### 1. Send OTP
```bash
curl -X POST http://localhost:3000/tenant/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
```

**Note:** Check console for OTP (currently logs to console). Integrate SMS service later.

### 2. Verify OTP & Login
```bash
curl -X POST http://localhost:3000/tenant/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "otp": "1234"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "tenant": {
      "s_no": 1,
      "name": "John Doe",
      "phone": "+919876543210",
      ...
    }
  }
}
```

### 3. Get Profile (Use access token)
```bash
curl -X GET http://localhost:3000/tenant/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🔒 Security Features

### Role-Based Access Control
```typescript
@Controller('tenant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)  // ← Only tenants can access
export class TenantPortalController {
  // ...
}
```

### JWT Payload
```typescript
{
  sub: 1,                    // Tenant ID
  tenantId: 1,               // Same as sub
  phone: "+919876543210",    // Tenant phone
  role: "TENANT",            // User role
  pgId: 1,                   // PG location ID
  roomId: 5,                 // Current room
  bedId: 12,                 // Current bed
  iat: 1234567890,
  exp: 1234567890
}
```

## 📝 Schema Field Mappings

The module adapts to your existing schema:

| API Field | Database Field |
|-----------|----------------|
| `phone` | `phone_no` |
| `pg_name` | `location_name` |
| All other fields | Same name |

## 🔄 Next Steps

### Immediate:
1. ✅ Add `TenantPortalModule` to `app.module.ts`
2. ✅ Test OTP login flow
3. ✅ Integrate SMS service (replace `console.log`)

### Future Enhancements:
- [ ] Add ticket system for complaints
- [ ] Add online payment integration
- [ ] Add push notifications
- [ ] Add visitor management
- [ ] Add expense sharing view

## ⚠️ Important Notes

1. **OTP Currently Logs to Console**
   - For production, integrate Twilio/AWS SNS
   - Update `tenant-auth.service.ts` line 60

2. **Tenant Status Check**
   - Only `ACTIVE` tenants can login
   - Adjust in `tenant-auth.service.ts` if needed

3. **No Schema Changes Required**
   - Works with existing tables
   - Optional: Add `last_login_at` field later for analytics

## 🐛 Troubleshooting

### "Tenant not found"
- Check `phone_no` field in `tenants` table
- Ensure `is_deleted = false`
- Ensure `status = 'ACTIVE'`

### "Invalid OTP"
- Check `otp_verifications` table exists
- OTP expires in 10 minutes
- Check console logs for generated OTP

### "Forbidden - Not a tenant"
- JWT token must have `role: 'TENANT'`
- Check token payload

## 📚 Documentation

See `README.md` for:
- Complete API documentation
- Error handling
- Response formats
- Future features

---

**Status:** ✅ Ready to use with existing schema!
