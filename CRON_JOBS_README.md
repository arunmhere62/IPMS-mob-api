# Cron Jobs Documentation

Complete guide for automated scheduled tasks in the PG Management backend.

---

## Table of Contents

1. [Overview](#overview)
2. [Implemented Cron Jobs](#implemented-cron-jobs)
3. [Architecture](#architecture)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Monitoring](#monitoring)
7. [Customization](#customization)

---

## Overview

The PG Management system uses **NestJS Schedule** module to run automated tasks at specific intervals. These cron jobs help automate notifications and reminders for pending rent payments.

### Features

- ✅ Automatic pending rent payment checks every 6 hours
- ✅ Daily payment reminders at 9 AM
- ✅ Notifications sent to PG owners via push notifications
- ✅ Manual trigger endpoints for testing
- ✅ Comprehensive logging for monitoring

---

## Implemented Cron Jobs

### 1. Pending Rent Payment Check

**Schedule:** Every 6 hours (12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM IST)

**Cron Expression:** `0 */6 * * *`

**Purpose:** Checks all active tenants with pending rent payments and sends notifications to PG owners.

**Logic:**
1. Fetches all tenants with pending rent using existing `PendingPaymentService.getAllPendingPayments()`
2. Groups tenants by their PG owner
3. Calculates total pending amount per owner
4. Sends push notification to each owner with:
   - Number of tenants with pending rent
   - Total pending amount
   - List of tenant details

**Notification Example:**
```
Title: 💰 Pending Rent Payments
Body: 3 tenants have pending rent totaling ₹15,000.00
Data: {
  type: 'PENDING_RENT',
  tenant_count: 3,
  total_pending: 15000,
  tenants: [...]
}
```

---

### 2. Daily Payment Reminder

**Schedule:** Daily at 9:00 AM IST

**Cron Expression:** `0 9 * * *`

**Purpose:** Reminds PG owners about tenants whose rent payment is due today.

**Logic:**
1. Fetches tenants whose last payment end date is today
2. Groups by PG owner
3. Sends notification with list of tenants

**Notification Example:**
```
Title: ⏰ Payment Due Today
Body: 2 tenants have rent payment due today
Data: {
  type: 'PAYMENT_DUE_TODAY',
  tenant_count: 2,
  tenants: [...]
}
```

---

## Architecture

### File Structure

```
mobile/mob-api/src/modules/tenant/pending-payment/
├── pending-payment.service.ts          # Business logic for pending payments
├── pending-payment-cron.service.ts     # Cron job implementation
├── pending-payment-cron.controller.ts  # Manual trigger endpoints
├── pending-payment.controller.ts       # Regular API endpoints
└── pending-payment.module.ts           # Module configuration
```

### Dependencies

```typescript
// Required modules
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../../notification/notification.module';
import { PrismaModule } from '../../../prisma/prisma.module';
```

### Service Structure

```typescript
@Injectable()
export class PendingPaymentCronService {
  constructor(
    private pendingPaymentService: PendingPaymentService,
    private notificationService: NotificationService,
    private prisma: PrismaService,
  ) {}

  @Cron('0 */6 * * *', {
    name: 'check-pending-rent-payments',
    timeZone: 'Asia/Kolkata',
  })
  async checkPendingRentPayments() {
    // Implementation
  }
}
```

---

## Configuration

### 1. Enable Schedule Module

In `app.module.ts`:

```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable cron jobs globally
    // ... other modules
  ],
})
export class AppModule {}
```

### 2. Register Cron Service

In `pending-payment.module.ts`:

```typescript
@Module({
  imports: [PrismaModule, CommonModule, NotificationModule],
  controllers: [PendingPaymentController, PendingPaymentCronController],
  providers: [
    PendingPaymentService,
    PendingPaymentCronService, // Register cron service
    TenantStatusService,
  ],
  exports: [PendingPaymentService],
})
export class PendingPaymentModule {}
```

### 3. Timezone Configuration

All cron jobs use **Asia/Kolkata (IST)** timezone:

```typescript
@Cron('0 */6 * * *', {
  name: 'check-pending-rent-payments',
  timeZone: 'Asia/Kolkata', // IST timezone
})
```

---

## Testing

### Manual Trigger Endpoints

For testing purposes, you can manually trigger cron jobs via API endpoints:

#### 1. Trigger Pending Rent Check

```bash
POST /api/v1/pending-payment-cron/trigger-pending-check
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "Cron job triggered",
  "success": true,
  "data": {
    "message": "Pending rent check triggered successfully"
  }
}
```

#### 2. Trigger Daily Reminder

```bash
POST /api/v1/pending-payment-cron/trigger-daily-reminder
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "Cron job triggered",
  "success": true,
  "data": {
    "message": "Daily reminder triggered successfully"
  }
}
```

### Testing Workflow

1. **Setup Test Data:**
   - Create active tenants with pending rent
   - Ensure PG owner has registered push tokens

2. **Trigger Manually:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/pending-payment-cron/trigger-pending-check \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

3. **Check Logs:**
   ```
   🔔 [CRON] Starting pending rent payment check...
   📊 [CRON] Found 3 tenants with pending rent
   ✅ [CRON] Sent pending rent notification to owner 1: 3 tenants, ₹15000.00
   ✅ [CRON] Pending rent payment check completed
   ```

4. **Verify Notification:**
   - Check mobile app for push notification
   - Verify notification data in app

---

## Monitoring

### Log Messages

The cron service provides detailed logging:

| Log Level | Message | Meaning |
|-----------|---------|---------|
| `LOG` | `🔔 [CRON] Starting pending rent payment check...` | Cron job started |
| `LOG` | `📊 [CRON] Found X tenants with pending rent` | Found tenants with pending payments |
| `LOG` | `✅ [CRON] Sent pending rent notification to owner X` | Notification sent successfully |
| `WARN` | `⚠️ [CRON] No active push tokens for owner X` | Owner has no registered devices |
| `ERROR` | `❌ [CRON] Error checking pending rent payments` | Cron job failed |

### Monitoring Checklist

- [ ] Check logs for successful cron execution
- [ ] Verify notifications are being sent
- [ ] Monitor for errors in logs
- [ ] Check push token registration for owners
- [ ] Verify notification delivery receipts

### Common Issues

#### Issue: No notifications sent

**Possible Causes:**
1. No tenants with pending rent
2. PG owner has no registered push tokens
3. Push tokens are inactive

**Solution:**
```sql
-- Check if owner has active tokens
SELECT * FROM user_fcm_tokens 
WHERE user_id = ? AND is_active = true;

-- Check pending payments
SELECT * FROM tenants 
WHERE status = 'ACTIVE' AND is_deleted = false;
```

#### Issue: Cron job not running

**Possible Causes:**
1. ScheduleModule not imported in app.module
2. Cron service not registered in module
3. Application not running

**Solution:**
- Verify `ScheduleModule.forRoot()` in `app.module.ts`
- Check `PendingPaymentCronService` in providers array
- Restart application

---

## Customization

### Change Cron Schedule

Edit the cron expression in `pending-payment-cron.service.ts`:

```typescript
// Every 6 hours (current)
@Cron('0 */6 * * *', { ... })

// Every 3 hours
@Cron('0 */3 * * *', { ... })

// Every day at 8 AM
@Cron('0 8 * * *', { ... })

// Every Monday at 9 AM
@Cron('0 9 * * 1', { ... })
```

### Cron Expression Reference

```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └─ Day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ └─── Month (1-12)
│ │ │ └───── Day of month (1-31)
│ │ └─────── Hour (0-23)
│ └───────── Minute (0-59)
└─────────── Second (0-59, optional)
```

**Examples:**
- `0 */6 * * *` - Every 6 hours
- `0 9 * * *` - Every day at 9 AM
- `0 0 * * 0` - Every Sunday at midnight
- `0 0 1 * *` - First day of every month at midnight

### Add New Cron Job

1. **Add method in `PendingPaymentCronService`:**

```typescript
@Cron('0 0 * * *', {
  name: 'monthly-report',
  timeZone: 'Asia/Kolkata',
})
async sendMonthlyReport() {
  this.logger.log('🔔 [CRON] Starting monthly report...');
  
  try {
    // Your logic here
    
    this.logger.log('✅ [CRON] Monthly report completed');
  } catch (error) {
    this.logger.error(`❌ [CRON] Error: ${error.message}`);
  }
}
```

2. **Add manual trigger method:**

```typescript
async triggerMonthlyReport() {
  this.logger.log('🔧 [MANUAL] Manually triggered monthly report');
  await this.sendMonthlyReport();
}
```

3. **Add controller endpoint:**

```typescript
@Post('trigger-monthly-report')
async triggerMonthlyReport() {
  await this.cronService.triggerMonthlyReport();
  return ResponseUtil.success(
    { message: 'Monthly report triggered' },
    'Cron job triggered',
  );
}
```

### Customize Notification Message

Edit notification content in `sendPendingRentNotification()`:

```typescript
const title = '💰 Pending Rent Payments'; // Change title
const body = `${tenantCount} tenant${tenantCount > 1 ? 's have' : ' has'} pending rent totaling ₹${totalPending.toFixed(2)}`; // Change body

// Add more data
data: {
  type: 'PENDING_RENT',
  tenant_count: tenantCount,
  total_pending: totalPending,
  timestamp: new Date().toISOString(), // Add timestamp
  tenants: tenants.map(t => ({
    tenant_id: t.tenant_id,
    tenant_name: t.tenant_name,
    room_no: t.room_no,
    pending_amount: t.total_pending,
    due_date: t.next_due_date, // Add due date
  })),
}
```

---

## Production Considerations

### 1. Error Handling

All cron jobs have try-catch blocks to prevent crashes:

```typescript
try {
  // Cron logic
} catch (error) {
  this.logger.error(`❌ [CRON] Error: ${error.message}`, error.stack);
  // Application continues running
}
```

### 2. Performance

- Cron jobs run asynchronously
- Don't block main application thread
- Use database indexes for faster queries
- Batch notifications for multiple users

### 3. Scalability

**For multiple server instances:**

- Use distributed cron with Redis (optional)
- Or ensure only one instance runs crons
- Consider using external scheduler (e.g., AWS EventBridge)

**Example with Redis:**
```typescript
import { RedisService } from '@nestjs-modules/ioredis';

async checkPendingRentPayments() {
  const lock = await this.redis.set('cron:pending-rent', '1', 'EX', 300, 'NX');
  if (!lock) {
    this.logger.log('Another instance is running this cron');
    return;
  }
  
  try {
    // Cron logic
  } finally {
    await this.redis.del('cron:pending-rent');
  }
}
```

### 4. Monitoring in Production

- Set up alerts for cron failures
- Monitor notification delivery rates
- Track execution time
- Log to external service (e.g., Sentry, LogRocket)

---

## API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/pending-payment-cron/trigger-pending-check` | POST | JWT | Manually trigger pending rent check |
| `/pending-payment-cron/trigger-daily-reminder` | POST | JWT | Manually trigger daily reminder |

---

## Environment Variables

No additional environment variables required. Cron jobs use existing configuration:

- Database connection (Prisma)
- Notification service (Expo Push)
- Timezone: Asia/Kolkata (hardcoded)

---

## Troubleshooting

### Check if cron is running

```bash
# Check application logs
tail -f logs/application.log | grep CRON

# Expected output every 6 hours:
# 🔔 [CRON] Starting pending rent payment check...
```

### Test notification delivery

```bash
# 1. Trigger manually
curl -X POST http://localhost:3000/api/v1/pending-payment-cron/trigger-pending-check \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 2. Check notification service logs
# 3. Verify push notification on device
```

### Debug pending payment logic

```bash
# Check pending payments directly
curl -X GET http://localhost:3000/api/v1/pending-payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Future Enhancements

Potential improvements:

1. **Weekly/Monthly Reports:** Send summary reports to owners
2. **Overdue Escalation:** Increase notification frequency for overdue payments
3. **SMS Notifications:** Add SMS backup for critical reminders
4. **Email Notifications:** Send detailed reports via email
5. **Custom Schedules:** Allow owners to configure notification times
6. **Notification Preferences:** Let users choose notification types
7. **Analytics:** Track notification open rates and payment responses

---

## Related Documentation

- [NOTIFICATIONS_README.md](../../mob-ui/NOTIFICATIONS_README.md) - Complete notification setup guide
- [Pending Payment Service](./pending-payment.service.ts) - Business logic implementation
- [NestJS Schedule Docs](https://docs.nestjs.com/techniques/task-scheduling) - Official documentation

---

**Last Updated:** December 30, 2025  
**Version:** 1.0.0  
**Author:** PG Management Team
