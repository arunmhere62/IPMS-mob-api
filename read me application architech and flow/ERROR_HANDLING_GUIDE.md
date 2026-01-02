# API Error Handling & Response Format Guide

## Overview

This API implements a **centralized, consistent error handling system** that ensures all responses (success and error) follow a standardized format. This allows the frontend to handle responses uniformly.

---

## Standard Response Format

### Success Response (2xx)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": {
    // Your actual data here
  },
  "timestamp": "2024-01-15T10:30:45.123Z",
  "path": "/api/v1/users"
}
```

### Error Response (4xx, 5xx)
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed. Please check your input.",
  "error": {
    "code": "VAL_001",
    "details": [
      {
        "field": "email",
        "message": "email must be an email"
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:45.123Z",
  "path": "/api/v1/users"
}
```

---

## Error Codes & HTTP Status Codes

### Authentication & Authorization (401, 403)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `AUTH_001` | Unauthorized access. Please login. | 401 |
| `AUTH_002` | Access forbidden. You do not have permission. | 403 |
| `AUTH_003` | Invalid email or password. | 401 |
| `AUTH_004` | Your session has expired. Please login again. | 401 |
| `AUTH_005` | Invalid or malformed token. | 401 |
| `AUTH_006` | Your session has expired. | 401 |

### Validation Errors (400)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `VAL_001` | Validation failed. Please check your input. | 400 |
| `VAL_002` | Invalid input provided. | 400 |
| `VAL_003` | Required field is missing. | 400 |
| `VAL_004` | Invalid format provided. | 400 |

### Resource Errors (404, 409)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `RES_001` | Resource not found. | 404 |
| `RES_002` | The requested resource does not exist. | 404 |
| `RES_003` | Resource already exists. | 409 |

### Business Logic Errors (422, 403, 429)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `BIZ_001` | Business logic error occurred. | 422 |
| `BIZ_002` | Invalid state for this operation. | 422 |
| `BIZ_003` | This operation is not allowed. | 422 |
| `BIZ_004` | Insufficient permissions for this action. | 403 |
| `BIZ_005` | Quota exceeded. Please try again later. | 429 |

### Server Errors (500, 502, 503)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `SRV_001` | Internal server error occurred. | 500 |
| `SRV_002` | Database error occurred. Please try again later. | 500 |
| `SRV_003` | External service error. Please try again later. | 502 |
| `SRV_004` | Service is temporarily unavailable. | 503 |

### File Upload Errors (400, 404, 413)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `FILE_001` | File upload failed. | 400 |
| `FILE_002` | File size exceeds the maximum limit. | 413 |
| `FILE_003` | Invalid file type. Please upload a valid file. | 400 |
| `FILE_004` | File not found. | 404 |

### Rate Limiting (429)
| Error Code | Message | HTTP Status |
|-----------|---------|------------|
| `RATE_001` | Rate limit exceeded. Please try again later. | 429 |
| `RATE_002` | Too many requests. Please try again later. | 429 |

---

## How to Use in Controllers

### 1. Throwing Errors

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { 
  ApiException, 
  NotFoundException, 
  ValidationException,
  ConflictException 
} from 'src/common/exceptions/api.exception';
import { ErrorCode } from 'src/common/constants/error-codes';

@Controller('users')
export class UserController {
  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    // Check if user already exists
    const existingUser = await this.userService.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user
    const user = await this.userService.create(createUserDto);
    return user;
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const user = await this.userService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Post('validate')
  async validateData(@Body() data: any) {
    if (!data.email) {
      throw new ValidationException('Email is required', {
        field: 'email',
        message: 'Email is required'
      });
    }
    return { valid: true };
  }
}
```

### 2. Using Response Utilities

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ResponseUtil } from 'src/common/utils/response.util';

@Controller('products')
export class ProductController {
  @Get()
  async getProducts(@Query('page') page = 1, @Query('limit') limit = 10) {
    const { data, total } = await this.productService.findAll(page, limit);
    
    // Use paginated response helper
    return ResponseUtil.paginated(data, total, page, limit, 'Products fetched successfully');
  }

  @Post()
  async createProduct(@Body() createProductDto: CreateProductDto) {
    const product = await this.productService.create(createProductDto);
    
    // Use created response helper (returns 201)
    return ResponseUtil.created(product, 'Product created successfully');
  }

  @Delete(':id')
  async deleteProduct(@Param('id') id: string) {
    await this.productService.delete(id);
    
    // Use no content response helper (returns 204)
    return ResponseUtil.noContent('Product deleted successfully');
  }
}
```

### 3. Custom Error with Details

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { ApiException } from 'src/common/exceptions/api.exception';
import { ErrorCode } from 'src/common/constants/error-codes';

@Controller('payments')
export class PaymentController {
  @Post('process')
  async processPayment(@Body() paymentDto: PaymentDto) {
    try {
      const result = await this.paymentService.process(paymentDto);
      return result;
    } catch (error) {
      // Throw custom error with details
      throw new ApiException(
        ErrorCode.BUSINESS_LOGIC_ERROR,
        'Payment processing failed',
        {
          reason: error.message,
          transactionId: error.transactionId,
          retryable: error.retryable
        }
      );
    }
  }
}
```

---

## How Errors Are Handled

### 1. **Global Exception Filter** (`GlobalExceptionFilter`)
   - Catches ALL exceptions thrown in the application
   - Converts them to standardized format
   - Handles:
     - Custom `ApiException` errors
     - NestJS `HttpException` errors
     - Prisma database errors
     - Generic JavaScript errors
     - Validation errors from `class-validator`

### 2. **Global Response Interceptor** (`TransformInterceptor`)
   - Wraps all successful responses
   - Ensures consistent response format
   - Automatically adds `success`, `statusCode`, `timestamp`, `path`

### 3. **Exception Hierarchy**
```
Error
├── HttpException
│   └── ApiException (custom)
│       ├── ValidationException
│       ├── NotFoundException
│       ├── UnauthorizedException
│       ├── ForbiddenException
│       ├── BusinessLogicException
│       ├── ConflictException
│       └── RateLimitException
└── Prisma Errors (P2002, P2025, etc.)
```

---

## Frontend Integration

### Example: Handling API Responses

```javascript
// Success Response
const response = await fetch('/api/v1/users');
const result = await response.json();

if (result.success) {
  console.log('Data:', result.data);
  console.log('Message:', result.message);
} else {
  console.error('Error Code:', result.error.code);
  console.error('Error Message:', result.message);
  console.error('Details:', result.error.details);
}

// Error Response
try {
  const response = await fetch('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'test@example.com' })
  });
  
  const result = await response.json();
  
  if (!result.success) {
    switch (result.error.code) {
      case 'VAL_001':
        console.error('Validation failed:', result.error.details);
        break;
      case 'AUTH_001':
        // Redirect to login
        window.location.href = '/login';
        break;
      case 'RES_003':
        console.error('Resource already exists');
        break;
      default:
        console.error('Error:', result.message);
    }
  }
} catch (error) {
  console.error('Network error:', error);
}
```

---

## Common Patterns

### Pattern 1: Check & Throw
```typescript
const user = await this.userService.findById(id);
if (!user) {
  throw new NotFoundException(`User with ID ${id} not found`);
}
```

### Pattern 2: Validation Before Operation
```typescript
if (!createUserDto.email) {
  throw new ValidationException('Email is required', {
    field: 'email',
    message: 'Email is required'
  });
}
```

### Pattern 3: Catch Database Errors
```typescript
try {
  await this.userService.create(createUserDto);
} catch (error) {
  if (error.code === 'P2002') {
    throw new ConflictException('User with this email already exists');
  }
  throw error;
}
```

### Pattern 4: Business Logic Validation
```typescript
if (order.status !== 'pending') {
  throw new BusinessLogicException(
    'Can only cancel pending orders',
    { currentStatus: order.status }
  );
}
```

---

## Development vs Production

- **Development**: Error details and stack traces are included in responses
- **Production**: Sensitive error details are hidden; only user-friendly messages are shown

---

## Testing Error Responses

```bash
# Test validation error
curl -X POST http://localhost:5000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John"}'

# Test not found
curl http://localhost:5000/api/v1/users/invalid-id

# Test success
curl http://localhost:5000/api/v1/users
```

---

## Summary

✅ **Consistent Response Format** - All responses follow the same structure  
✅ **Standardized Error Codes** - Easy to handle on frontend  
✅ **HTTP Status Codes** - Proper status codes for each error type  
✅ **Global Handling** - No need to manually format responses in controllers  
✅ **Extensible** - Easy to add new error types  
✅ **Developer Friendly** - Clear error messages and details in development  
