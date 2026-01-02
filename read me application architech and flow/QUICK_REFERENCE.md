# Quick Reference - Error Handling System

## Throwing Errors

```typescript
// Not Found (404)
throw new NotFoundException('User not found');

// Conflict (409)
throw new ConflictException('Email already exists');

// Validation (400)
throw new ValidationException('Invalid input', { field: 'email' });

// Unauthorized (401)
throw new UnauthorizedException('Please login');

// Forbidden (403)
throw new ForbiddenException('No permission');

// Business Logic (422)
throw new BusinessLogicException('Cannot perform action', { reason: '...' });

// Rate Limit (429)
throw new RateLimitException('Too many requests');

// Custom Error
throw new ApiException(ErrorCode.CUSTOM, 'Message', details);
```

## Success Responses

```typescript
// Standard success (200)
return ResponseUtil.success(data, 'Message');

// Created (201)
return ResponseUtil.created(data, 'Resource created');

// Paginated (200)
return ResponseUtil.paginated(data, total, page, limit, 'Message');

// No Content (204)
return ResponseUtil.noContent('Deleted');

// Accepted (202)
return ResponseUtil.accepted(data, 'Processing');
```

## Common Patterns

### Check and Throw
```typescript
const item = await service.findById(id);
if (!item) throw new NotFoundException('Not found');
```

### Conflict Check
```typescript
const existing = await service.findByEmail(email);
if (existing) throw new ConflictException('Already exists');
```

### Business Logic
```typescript
if (item.status === 'deleted') {
  throw new BusinessLogicException('Cannot perform action');
}
```

### Prisma Error Handling
```typescript
try {
  return await prisma.model.create({ data });
} catch (error) {
  if (error.code === 'P2002') {
    throw new ConflictException('Unique constraint');
  }
  throw error;
}
```

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_001 | 401 | Unauthorized |
| AUTH_002 | 403 | Forbidden |
| AUTH_003 | 401 | Invalid credentials |
| VAL_001 | 400 | Validation failed |
| RES_001 | 404 | Not found |
| RES_003 | 409 | Already exists |
| BIZ_001 | 422 | Business logic error |
| SRV_001 | 500 | Server error |
| SRV_002 | 500 | Database error |
| FILE_002 | 413 | File too large |
| RATE_001 | 429 | Rate limit |

## Response Format

### Success
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": {},
  "timestamp": "2024-01-15T10:30:45.123Z",
  "path": "/api/v1/endpoint"
}
```

### Error
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error message",
  "error": {
    "code": "ERR_001",
    "details": null
  },
  "timestamp": "2024-01-15T10:30:45.123Z",
  "path": "/api/v1/endpoint"
}
```

## Controller Template

```typescript
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { NotFoundException, ConflictException } from 'src/common/exceptions/api.exception';
import { ResponseUtil } from 'src/common/utils/response.util';

@Controller('resource')
export class ResourceController {
  constructor(private service: ResourceService) {}

  @Get()
  async getAll() {
    const data = await this.service.findAll();
    return ResponseUtil.success(data);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const item = await this.service.findById(id);
    if (!item) throw new NotFoundException('Not found');
    return ResponseUtil.success(item);
  }

  @Post()
  async create(@Body() dto: CreateDto) {
    const existing = await this.service.findByUnique(dto.unique);
    if (existing) throw new ConflictException('Already exists');
    const item = await this.service.create(dto);
    return ResponseUtil.created(item);
  }
}
```

## Service Template

```typescript
import { Injectable } from '@nestjs/common';
import { NotFoundException, ConflictException } from 'src/common/exceptions/api.exception';

@Injectable()
export class ResourceService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return await this.prisma.resource.findMany();
  }

  async findById(id: string) {
    return await this.prisma.resource.findUnique({ where: { id } });
  }

  async create(dto: CreateDto) {
    try {
      return await this.prisma.resource.create({ data: dto });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Already exists');
      }
      throw error;
    }
  }

  async delete(id: string) {
    const item = await this.findById(id);
    if (!item) throw new NotFoundException('Not found');
    return await this.prisma.resource.delete({ where: { id } });
  }
}
```

## Imports

```typescript
// Exceptions
import { 
  NotFoundException,
  ConflictException,
  ValidationException,
  UnauthorizedException,
  ForbiddenException,
  BusinessLogicException,
  RateLimitException,
  ApiException
} from 'src/common/exceptions/api.exception';

// Response Helper
import { ResponseUtil } from 'src/common/utils/response.util';

// Error Codes
import { ErrorCode } from 'src/common/constants/error-codes';
```

## Testing

```bash
# Success
curl http://localhost:5000/api/v1/resource

# Not Found
curl http://localhost:5000/api/v1/resource/invalid

# Create Success
curl -X POST http://localhost:5000/api/v1/resource \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'

# Validation Error
curl -X POST http://localhost:5000/api/v1/resource \
  -H "Content-Type: application/json" \
  -d '{}'

# Conflict
curl -X POST http://localhost:5000/api/v1/resource \
  -H "Content-Type: application/json" \
  -d '{"email": "existing@example.com"}'
```

## Files Reference

| File | Purpose |
|------|---------|
| `src/common/dto/response.dto.ts` | Response format |
| `src/common/constants/error-codes.ts` | Error codes & messages |
| `src/common/exceptions/api.exception.ts` | Exception classes |
| `src/common/filters/http-exception.filter.ts` | Global error handler |
| `src/common/interceptors/transform.interceptor.ts` | Response wrapper |
| `src/common/utils/response.util.ts` | Response helpers |
| `ERROR_HANDLING_GUIDE.md` | Complete guide |
| `IMPLEMENTATION_EXAMPLE.md` | Code examples |
| `MIGRATION_CHECKLIST.md` | Migration steps |
| `ARCHITECTURE_OVERVIEW.md` | System design |

## Key Points

✅ All responses are standardized  
✅ All errors have codes  
✅ HTTP status codes are correct  
✅ No try-catch needed in controllers  
✅ Errors are caught globally  
✅ Responses are wrapped automatically  
✅ Frontend gets predictable format  
✅ Easy to maintain and extend  

## Common Mistakes to Avoid

❌ Don't use `return` for errors - use `throw`  
❌ Don't manually format responses - use `ResponseUtil`  
❌ Don't add try-catch in controllers - let filter handle it  
❌ Don't forget to throw exceptions - don't return errors  
❌ Don't use generic `Error` - use specific exceptions  
❌ Don't add timestamp/statusCode manually - interceptor does it  

## When to Use Each Exception

| Exception | When | Example |
|-----------|------|---------|
| NotFoundException | Resource doesn't exist | User not found |
| ConflictException | Resource already exists | Email already registered |
| ValidationException | Input is invalid | Missing required field |
| UnauthorizedException | Not authenticated | No token provided |
| ForbiddenException | Not authorized | No permission |
| BusinessLogicException | Business rule violated | Cannot delete last admin |
| RateLimitException | Too many requests | Rate limit exceeded |

## Frontend Error Handling

```javascript
const response = await fetch('/api/v1/endpoint');
const result = await response.json();

if (result.success) {
  // Handle success
  console.log(result.data);
} else {
  // Handle error
  switch (result.error.code) {
    case 'RES_002':
      console.error('Not found');
      break;
    case 'RES_003':
      console.error('Already exists');
      break;
    case 'VAL_001':
      console.error('Validation error:', result.error.details);
      break;
    case 'AUTH_001':
      // Redirect to login
      window.location.href = '/login';
      break;
    default:
      console.error(result.message);
  }
}
```

## Checklist for New Endpoint

- [ ] Controller throws exceptions (not returns)
- [ ] Service throws exceptions (not returns)
- [ ] Success responses use ResponseUtil
- [ ] No try-catch in controller
- [ ] No manual response formatting
- [ ] Proper exception class used
- [ ] Endpoint tested with curl
- [ ] Error cases tested
- [ ] Success cases tested
- [ ] HTTP status codes verified

## Documentation

- **ERROR_HANDLING_GUIDE.md** - Read first for complete understanding
- **IMPLEMENTATION_EXAMPLE.md** - See before/after code examples
- **MIGRATION_CHECKLIST.md** - Follow when updating endpoints
- **ARCHITECTURE_OVERVIEW.md** - Understand system design
- **QUICK_REFERENCE.md** - This file, for quick lookup

---

**Last Updated**: 2024-01-15  
**Version**: 1.0  
**Status**: Production Ready
