# Migration Checklist - Converting Existing Endpoints

Use this checklist to systematically migrate your existing endpoints to use the new centralized error handling system.

---

## Pre-Migration

- [ ] Read `ERROR_HANDLING_GUIDE.md`
- [ ] Read `IMPLEMENTATION_EXAMPLE.md`
- [ ] Understand the new response format
- [ ] Understand the new error codes
- [ ] Review the exception classes

---

## For Each Controller/Endpoint

### Step 1: Add Imports

```typescript
// Add these imports at the top of your controller file
import { 
  NotFoundException, 
  ConflictException,
  ValidationException,
  BusinessLogicException,
  UnauthorizedException,
  ForbiddenException,
  ApiException
} from 'src/common/exceptions/api.exception';
import { ResponseUtil } from 'src/common/utils/response.util';
import { ErrorCode } from 'src/common/constants/error-codes';
```

- [ ] Added necessary exception imports
- [ ] Added ResponseUtil import
- [ ] Added ErrorCode import (if using custom errors)

### Step 2: Remove Try-Catch Blocks

**Before:**
```typescript
@Get(':id')
async getUser(@Param('id') id: string) {
  try {
    const user = await this.userService.findById(id);
    if (!user) {
      return { statusCode: 404, message: 'User not found' };
    }
    return { statusCode: 200, data: user };
  } catch (error) {
    return { statusCode: 500, message: 'Internal server error' };
  }
}
```

**After:**
```typescript
@Get(':id')
async getUser(@Param('id') id: string) {
  const user = await this.userService.findById(id);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}
```

- [ ] Removed try-catch blocks
- [ ] Replaced error returns with exception throws
- [ ] Removed manual response wrapping

### Step 3: Replace Error Returns with Exceptions

| Old | New |
|-----|-----|
| `return { statusCode: 404, message: 'Not found' }` | `throw new NotFoundException('Not found')` |
| `return { statusCode: 409, message: 'Already exists' }` | `throw new ConflictException('Already exists')` |
| `return { statusCode: 400, message: 'Invalid input' }` | `throw new ValidationException('Invalid input')` |
| `return { statusCode: 401, message: 'Unauthorized' }` | `throw new UnauthorizedException('Unauthorized')` |
| `return { statusCode: 403, message: 'Forbidden' }` | `throw new ForbiddenException('Forbidden')` |
| `return { statusCode: 422, message: 'Business error' }` | `throw new BusinessLogicException('Business error')` |

- [ ] Replaced all error returns with exceptions
- [ ] Used appropriate exception class for each error type

### Step 4: Replace Success Returns with ResponseUtil

| Old | New |
|-----|-----|
| `return { statusCode: 200, data: user }` | `return ResponseUtil.success(user)` |
| `return { statusCode: 201, data: user }` | `return ResponseUtil.created(user)` |
| `return { statusCode: 200, data: users, pagination: {...} }` | `return ResponseUtil.paginated(users, total, page, limit)` |
| `return { statusCode: 204 }` | `return ResponseUtil.noContent()` |

- [ ] Replaced all success returns with ResponseUtil helpers
- [ ] Used appropriate helper for each response type

### Step 5: Remove Manual Response Formatting

Remove these from your responses:
- [ ] Manual `statusCode` assignment
- [ ] Manual `timestamp` assignment
- [ ] Manual `path` assignment
- [ ] Manual `success` flag
- [ ] Manual error wrapping

### Step 6: Update Service Layer

**Before:**
```typescript
async findById(id: string) {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}
```

**After:**
```typescript
async findById(id: string) {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}
```

- [ ] Updated service methods to throw exceptions instead of returning errors
- [ ] Used appropriate exception classes
- [ ] Removed generic `Error` throws

### Step 7: Handle Prisma Errors

The GlobalExceptionFilter automatically handles Prisma errors, but you can also catch them explicitly:

```typescript
async create(createUserDto: CreateUserDto) {
  try {
    return await this.prisma.user.create({
      data: createUserDto
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictException('User with this email already exists');
    }
    throw error; // Let GlobalExceptionFilter handle it
  }
}
```

- [ ] Reviewed Prisma error handling
- [ ] Added specific error handling for common Prisma errors (P2002, P2025, etc.)
- [ ] Tested database operations

### Step 8: Test the Endpoint

```bash
# Test success case
curl http://localhost:5000/api/v1/endpoint

# Test error cases
curl http://localhost:5000/api/v1/endpoint/invalid-id

# Test validation errors
curl -X POST http://localhost:5000/api/v1/endpoint \
  -H "Content-Type: application/json" \
  -d '{}'
```

- [ ] Tested success response format
- [ ] Tested error response format
- [ ] Tested validation errors
- [ ] Tested not found errors
- [ ] Tested conflict errors
- [ ] Verified HTTP status codes are correct

---

## Controller Migration Template

Use this template when migrating a controller:

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { YourService } from './your.service';
import { CreateYourDto } from './dto/create-your.dto';
import { UpdateYourDto } from './dto/update-your.dto';
import { 
  NotFoundException, 
  ConflictException,
  ValidationException,
  BusinessLogicException
} from 'src/common/exceptions/api.exception';
import { ResponseUtil } from 'src/common/utils/response.util';

@ApiTags('your-resource')
@Controller('your-resource')
export class YourController {
  constructor(private readonly yourService: YourService) {}

  @Get()
  @ApiOperation({ summary: 'Get all resources' })
  async getAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    const { data, total } = await this.yourService.findAll(page, limit);
    return ResponseUtil.paginated(data, total, page, limit, 'Resources fetched successfully');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resource by ID' })
  async getById(@Param('id') id: string) {
    const resource = await this.yourService.findById(id);
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }
    return ResponseUtil.success(resource, 'Resource fetched successfully');
  }

  @Post()
  @ApiOperation({ summary: 'Create resource' })
  async create(@Body() createYourDto: CreateYourDto) {
    // Check for conflicts
    const existing = await this.yourService.findByUnique(createYourDto.uniqueField);
    if (existing) {
      throw new ConflictException('Resource with this unique field already exists');
    }

    const resource = await this.yourService.create(createYourDto);
    return ResponseUtil.created(resource, 'Resource created successfully');
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update resource' })
  async update(@Param('id') id: string, @Body() updateYourDto: UpdateYourDto) {
    const resource = await this.yourService.findById(id);
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    // Business logic validation
    if (resource.status === 'locked') {
      throw new BusinessLogicException('Cannot update a locked resource');
    }

    const updated = await this.yourService.update(id, updateYourDto);
    return ResponseUtil.success(updated, 'Resource updated successfully');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete resource' })
  async delete(@Param('id') id: string) {
    const resource = await this.yourService.findById(id);
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    await this.yourService.delete(id);
    return ResponseUtil.noContent('Resource deleted successfully');
  }
}
```

- [ ] Created controller using template
- [ ] Updated all endpoints
- [ ] Added appropriate error handling
- [ ] Added appropriate response formatting

---

## Service Migration Template

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateYourDto } from './dto/create-your.dto';
import { UpdateYourDto } from './dto/update-your.dto';
import { 
  NotFoundException, 
  ConflictException,
  BusinessLogicException
} from 'src/common/exceptions/api.exception';

@Injectable()
export class YourService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.yourModel.findMany({ skip, take: limit }),
      this.prisma.yourModel.count(),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return await this.prisma.yourModel.findUnique({
      where: { id },
    });
  }

  async findByUnique(field: string) {
    return await this.prisma.yourModel.findUnique({
      where: { uniqueField: field },
    });
  }

  async create(createYourDto: CreateYourDto) {
    try {
      return await this.prisma.yourModel.create({
        data: createYourDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Resource with this unique field already exists');
      }
      throw error;
    }
  }

  async update(id: string, updateYourDto: UpdateYourDto) {
    const resource = await this.findById(id);
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    return await this.prisma.yourModel.update({
      where: { id },
      data: updateYourDto,
    });
  }

  async delete(id: string) {
    const resource = await this.findById(id);
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    return await this.prisma.yourModel.delete({
      where: { id },
    });
  }
}
```

- [ ] Created service using template
- [ ] Added appropriate error handling
- [ ] Handled Prisma errors

---

## Common Patterns

### Pattern 1: Check and Throw

```typescript
const resource = await this.service.findById(id);
if (!resource) {
  throw new NotFoundException('Resource not found');
}
```

- [ ] Using this pattern for existence checks

### Pattern 2: Conflict Check

```typescript
const existing = await this.service.findByEmail(email);
if (existing) {
  throw new ConflictException('Email already registered');
}
```

- [ ] Using this pattern for uniqueness checks

### Pattern 3: Business Logic Validation

```typescript
if (resource.status === 'deleted') {
  throw new BusinessLogicException('Cannot perform action on deleted resource');
}
```

- [ ] Using this pattern for business rule validation

### Pattern 4: Prisma Error Handling

```typescript
try {
  return await this.prisma.model.create({ data });
} catch (error) {
  if (error.code === 'P2002') {
    throw new ConflictException('Unique constraint violation');
  }
  throw error;
}
```

- [ ] Using this pattern for Prisma error handling

---

## Verification Checklist

After migrating each endpoint:

- [ ] No try-catch blocks in controller
- [ ] All errors thrown as exceptions
- [ ] All success responses use ResponseUtil
- [ ] No manual statusCode assignment
- [ ] No manual timestamp assignment
- [ ] Proper exception class used for each error
- [ ] HTTP status codes are correct
- [ ] Response format is consistent
- [ ] Error codes are included in responses
- [ ] Endpoint tested and working

---

## Testing Commands

```bash
# Test GET all
curl http://localhost:5000/api/v1/resource

# Test GET by ID (success)
curl http://localhost:5000/api/v1/resource/valid-id

# Test GET by ID (not found)
curl http://localhost:5000/api/v1/resource/invalid-id

# Test POST (success)
curl -X POST http://localhost:5000/api/v1/resource \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'

# Test POST (validation error)
curl -X POST http://localhost:5000/api/v1/resource \
  -H "Content-Type: application/json" \
  -d '{}'

# Test POST (conflict)
curl -X POST http://localhost:5000/api/v1/resource \
  -H "Content-Type: application/json" \
  -d '{"email": "existing@example.com"}'

# Test PUT
curl -X PUT http://localhost:5000/api/v1/resource/id \
  -H "Content-Type: application/json" \
  -d '{"field": "new-value"}'

# Test DELETE
curl -X DELETE http://localhost:5000/api/v1/resource/id
```

---

## Completion Checklist

- [ ] All controllers migrated
- [ ] All services updated
- [ ] All endpoints tested
- [ ] Error handling verified
- [ ] Response format verified
- [ ] HTTP status codes verified
- [ ] Frontend updated to handle new format
- [ ] Documentation reviewed
- [ ] Team trained on new system

---

## Notes

- The GlobalExceptionFilter catches all errors automatically
- The TransformInterceptor wraps all success responses automatically
- You don't need to manually format responses anymore
- Error details are hidden in production (only shown in development)
- All Prisma errors are automatically handled
- Validation errors from class-validator are automatically formatted

---

## Support

If you encounter issues:
1. Check the error code in the response
2. Review `ERROR_HANDLING_GUIDE.md`
3. Check `IMPLEMENTATION_EXAMPLE.md` for similar patterns
4. Verify the exception class is correct
5. Test the endpoint with curl

---

## Summary

Follow this checklist for each endpoint to systematically migrate your API to the new error handling system. The process is straightforward:

1. Add imports
2. Remove try-catch blocks
3. Replace error returns with exceptions
4. Replace success returns with ResponseUtil
5. Remove manual response formatting
6. Test the endpoint

Once all endpoints are migrated, your API will have:
- ✅ Consistent response format
- ✅ Proper error codes
- ✅ Correct HTTP status codes
- ✅ Minimal controller code
- ✅ Easy frontend integration
