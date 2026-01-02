# 🚀 BATCH MIGRATION - REMAINING MODULES

## Status: 4/19 Modules Complete (21%)

### ✅ Already Migrated
- tenant-payment ✅
- subscription ✅
- room ✅
- bed ✅

### ⏳ Remaining (15 modules)

**High Priority (3):**
- tenant (partially started)
- employee
- organization

**Medium Priority (6):**
- employee-salary, expense, pg-location, location, notification, ticket

**Management (3):**
- roles, role-permissions, permissions

**Optional (3):**
- visitor, payment-gateway, common

**Already Compliant (2):**
- auth, sms.service

---

## Universal Migration Template

For each module, apply this pattern:

### 1. Add Import
```typescript
import { ResponseUtil } from '../../common/utils/response.util';
```

### 2. Update Methods

**findAll():**
```typescript
// OLD: return { success: true, data, pagination: {...} };
// NEW: return ResponseUtil.paginated(data, total, page, limit, 'Message');
```

**findOne():**
```typescript
// OLD: if (!item) return { success: false }; return { success: true, data: item };
// NEW: if (!item) throw new NotFoundException(); return item;
```

**create():**
```typescript
// OLD: try { const item = await create(...); return { success: true, data: item }; }
// NEW: const item = await create(...); return item;
```

**update():**
```typescript
// OLD: const updated = await update(...); return { success: true, data: updated };
// NEW: const updated = await update(...); return updated;
```

**delete/remove():**
```typescript
// OLD: await delete(...); return { success: true, message: 'Deleted' };
// NEW: await delete(...); return ResponseUtil.noContent('Deleted');
```

**Methods with try-catch:**
```typescript
// Remove try-catch, let GlobalExceptionFilter handle errors
// Throw exceptions instead of returning error objects
```

---

## Quick Checklist

For each module:
- [ ] Add ResponseUtil import
- [ ] Remove all try-catch blocks
- [ ] Replace manual responses with ResponseUtil
- [ ] Throw exceptions instead of returning errors
- [ ] Test endpoints

---

## Estimated Time

- Per module: 15-30 minutes
- All 15 remaining: 3-7 hours
- Total project: ~8 hours

---

**Next Step:** Continue with tenant module, then migrate remaining modules using this template.
