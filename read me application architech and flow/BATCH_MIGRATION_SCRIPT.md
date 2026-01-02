# 🚀 Batch Migration Script - All Remaining Modules

## Status: Starting Batch Migration

This script will migrate all remaining modules to use the centralized error handling system.

### Already Migrated (2/18)
✅ tenant-payment  
✅ subscription  

### Modules to Migrate (16 remaining)

---

## Module 3: AUTH ✅ ALREADY COMPLIANT

**Status**: Already using proper exception handling  
**No changes needed** - Service already throws:
- `NotFoundException` for user not found
- `UnauthorizedException` for invalid OTP
- `BadRequestException` for validation errors

**Files**:
- `src/modules/auth/auth.controller.ts` - Already clean
- `src/modules/auth/auth-db.service.ts` - Already throws exceptions
- `src/modules/auth/auth.service.ts` - Already throws exceptions
- `src/modules/auth/sms.service.ts` - Already has try-catch for external API (OK)

**Action**: Just add ResponseUtil import for consistency

---

## Modules 4-18: CRUD Modules (Similar Pattern)

These modules follow a similar CRUD pattern and need:
1. Add ResponseUtil import
2. Remove try-catch blocks
3. Throw exceptions instead of returning errors
4. Use ResponseUtil for responses

### Module 4: TENANT
- **Service**: `src/modules/tenant/tenant.service.ts`
- **Controller**: `src/modules/tenant/tenant.controller.ts`
- **Sub-modules**:
  - advance-payment
  - checkout
  - current-bill
  - pending-payment
  - refund-payment
  - tenant-payment (✅ DONE)
  - tenant-status

### Module 5: ROOM
- **Service**: `src/modules/room/room.service.ts`
- **Controller**: `src/modules/room/room.controller.ts`

### Module 6: BED
- **Service**: `src/modules/bed/bed.service.ts`
- **Controller**: `src/modules/bed/bed.controller.ts`

### Module 7: EMPLOYEE
- **Service**: `src/modules/employee/employee.service.ts`
- **Controller**: `src/modules/employee/employee.controller.ts`

### Module 8: EMPLOYEE-SALARY
- **Service**: `src/modules/employee-salary/employee-salary.service.ts`
- **Controller**: `src/modules/employee-salary/employee-salary.controller.ts`

### Module 9: EXPENSE
- **Service**: `src/modules/expense/expense.service.ts`
- **Controller**: `src/modules/expense/expense.controller.ts`

### Module 10: ORGANIZATION
- **Service**: `src/modules/organization/organization.service.ts`
- **Controller**: `src/modules/organization/organization.controller.ts`

### Module 11: PG-LOCATION
- **Service**: `src/modules/pg-location/pg-location.service.ts`
- **Controller**: `src/modules/pg-location/pg-location.controller.ts`

### Module 12: ROLES
- **Service**: `src/modules/roles/roles.service.ts`
- **Controller**: `src/modules/roles/roles.controller.ts`

### Module 13: ROLE-PERMISSIONS
- **Service**: `src/modules/role-permissions/role-permissions.service.ts`
- **Controller**: `src/modules/role-permissions/role-permissions.controller.ts`

### Module 14: PERMISSIONS
- **Service**: `src/modules/permissions/permissions.service.ts`
- **Controller**: `src/modules/permissions/permissions.controller.ts`

### Module 15: TICKET
- **Service**: `src/modules/ticket/ticket.service.ts`
- **Controller**: `src/modules/ticket/ticket.controller.ts`

### Module 16: VISITOR
- **Service**: `src/modules/visitor/visitor.service.ts`
- **Controller**: `src/modules/visitor/visitor.controller.ts`

### Module 17: NOTIFICATION
- **Service**: `src/modules/notification/notification.service.ts`
- **Controller**: `src/modules/notification/notification.controller.ts`

### Module 18: PAYMENT-GATEWAY
- **Service**: `src/modules/payment-gateway/payment-gateway.service.ts`
- **Controller**: `src/modules/payment-gateway/payment-gateway.controller.ts`

### Module 19: LOCATION
- **Service**: `src/modules/location/location.service.ts`
- **Controller**: `src/modules/location/location.controller.ts`

---

## Migration Pattern Template

For each module:

### Step 1: Update Service
```typescript
// Add at top
import { ResponseUtil } from '../../../common/utils/response.util';

// For each method:
// 1. Remove try-catch blocks
// 2. Throw exceptions instead of returning errors
// 3. Use ResponseUtil for responses

// Example:
async findAll(page: number = 1, limit: number = 10) {
  // OLD:
  // try {
  //   const data = await this.prisma.model.findMany(...);
  //   return { success: true, data, pagination: {...} };
  // } catch (error) {
  //   throw new BadRequestException(error.message);
  // }

  // NEW:
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    this.prisma.model.findMany({ skip, take: limit }),
    this.prisma.model.count(),
  ]);
  return ResponseUtil.paginated(data, total, page, limit);
}

async findOne(id: number) {
  // OLD:
  // const item = await this.prisma.model.findUnique({ where: { id } });
  // if (!item) return { success: false, message: 'Not found' };
  // return { success: true, data: item };

  // NEW:
  const item = await this.prisma.model.findUnique({ where: { id } });
  if (!item) throw new NotFoundException('Resource not found');
  return item;
}

async create(dto: CreateDto) {
  // OLD:
  // try {
  //   const item = await this.prisma.model.create({ data: dto });
  //   return { success: true, data: item };
  // } catch (error) {
  //   if (error.code === 'P2002') {
  //     return { success: false, message: 'Already exists' };
  //   }
  //   throw new BadRequestException(error.message);
  // }

  // NEW:
  const item = await this.prisma.model.create({ data: dto });
  return item;
  // Prisma errors are automatically handled by GlobalExceptionFilter
}

async update(id: number, dto: UpdateDto) {
  // OLD:
  // const item = await this.prisma.model.findUnique({ where: { id } });
  // if (!item) return { success: false, message: 'Not found' };
  // const updated = await this.prisma.model.update({ where: { id }, data: dto });
  // return { success: true, data: updated };

  // NEW:
  const item = await this.prisma.model.findUnique({ where: { id } });
  if (!item) throw new NotFoundException('Resource not found');
  const updated = await this.prisma.model.update({ where: { id }, data: dto });
  return updated;
}

async remove(id: number) {
  // OLD:
  // const item = await this.prisma.model.findUnique({ where: { id } });
  // if (!item) return { success: false, message: 'Not found' };
  // await this.prisma.model.delete({ where: { id } });
  // return { success: true, message: 'Deleted' };

  // NEW:
  const item = await this.prisma.model.findUnique({ where: { id } });
  if (!item) throw new NotFoundException('Resource not found');
  await this.prisma.model.delete({ where: { id } });
  return ResponseUtil.noContent('Resource deleted successfully');
}
```

### Step 2: Update Controller
```typescript
// Add at top
import { ResponseUtil } from '../../../common/utils/response.util';

// Controllers usually just call service methods
// No changes needed if they already delegate to service
// Just ensure they don't have try-catch blocks
```

---

## Execution Plan

### Phase 1: Core Modules (High Priority)
1. ✅ tenant-payment
2. ✅ subscription
3. ⏳ auth (add ResponseUtil import)
4. ⏳ tenant (main + sub-modules)
5. ⏳ room
6. ⏳ bed

### Phase 2: Supporting Modules (Medium Priority)
7. ⏳ employee
8. ⏳ employee-salary
9. ⏳ expense
10. ⏳ organization
11. ⏳ pg-location

### Phase 3: Management Modules (Medium Priority)
12. ⏳ roles
13. ⏳ role-permissions
14. ⏳ permissions

### Phase 4: Optional Modules (Low Priority)
15. ⏳ ticket
16. ⏳ visitor
17. ⏳ notification
18. ⏳ payment-gateway
19. ⏳ location

---

## Completion Tracking

| # | Module | Status | Service | Controller | Tests |
|---|--------|--------|---------|------------|-------|
| 1 | tenant-payment | ✅ | ✅ | ✅ | ⏳ |
| 2 | subscription | ✅ | ✅ | ✅ | ⏳ |
| 3 | auth | ⏳ | ✅ | ✅ | ⏳ |
| 4 | tenant | ⏳ | ⏳ | ⏳ | ⏳ |
| 5 | room | ⏳ | ⏳ | ⏳ | ⏳ |
| 6 | bed | ⏳ | ⏳ | ⏳ | ⏳ |
| 7 | employee | ⏳ | ⏳ | ⏳ | ⏳ |
| 8 | employee-salary | ⏳ | ⏳ | ⏳ | ⏳ |
| 9 | expense | ⏳ | ⏳ | ⏳ | ⏳ |
| 10 | organization | ⏳ | ⏳ | ⏳ | ⏳ |
| 11 | pg-location | ⏳ | ⏳ | ⏳ | ⏳ |
| 12 | roles | ⏳ | ⏳ | ⏳ | ⏳ |
| 13 | role-permissions | ⏳ | ⏳ | ⏳ | ⏳ |
| 14 | permissions | ⏳ | ⏳ | ⏳ | ⏳ |
| 15 | ticket | ⏳ | ⏳ | ⏳ | ⏳ |
| 16 | visitor | ⏳ | ⏳ | ⏳ | ⏳ |
| 17 | notification | ⏳ | ⏳ | ⏳ | ⏳ |
| 18 | payment-gateway | ⏳ | ⏳ | ⏳ | ⏳ |
| 19 | location | ⏳ | ⏳ | ⏳ | ⏳ |

---

## Quick Commands

```bash
# Find all service files
find src/modules -name "*.service.ts" -type f

# Find all controller files
find src/modules -name "*.controller.ts" -type f

# Count remaining migrations
find src/modules -name "*.service.ts" -type f | wc -l
```

---

**Total Modules**: 19  
**Completed**: 2 (11%)  
**Remaining**: 17 (89%)  
**Estimated Time**: 3-4 hours  
**Priority**: HIGH  

---

**Last Updated**: 2024-01-15  
**Status**: In Progress
