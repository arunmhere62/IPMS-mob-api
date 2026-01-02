# API Error Handling Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Frontend)                        │
│                                                                   │
│  Receives standardized responses with:                           │
│  - success flag                                                  │
│  - statusCode                                                    │
│  - message                                                       │
│  - error code (if error)                                         │
│  - data (if success)                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTP Request/Response
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    NestJS Application                            │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. VALIDATION PIPE (Global)                                │ │
│  │    - Validates request DTOs                                │ │
│  │    - Uses class-validator decorators                       │ │
│  │    - Throws ValidationException if invalid                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 2. CONTROLLER                                              │ │
│  │    - Receives validated request                            │ │
│  │    - Calls service methods                                 │ │
│  │    - Throws exceptions on errors                           │ │
│  │    - Returns data on success                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                    ┌──────┴──────┐                               │
│                    │             │                               │
│                    ▼             ▼                               │
│              Success        Exception                            │
│                    │             │                               │
│                    │             ▼                               │
│                    │    ┌─────────────────────────┐              │
│                    │    │ GLOBAL EXCEPTION FILTER │              │
│                    │    │                         │              │
│                    │    │ Catches:                │              │
│                    │    │ - ApiException          │              │
│                    │    │ - HttpException         │              │
│                    │    │ - Prisma Errors         │              │
│                    │    │ - Generic Errors        │              │
│                    │    │ - Validation Errors     │              │
│                    │    │                         │              │
│                    │    │ Returns:                │              │
│                    │    │ - Standardized error    │              │
│                    │    │ - Error code            │              │
│                    │    │ - HTTP status code      │              │
│                    │    └─────────────────────────┘              │
│                    │             │                               │
│                    │             ▼                               │
│                    │      Error Response                         │
│                    │             │                               │
│                    └──────┬──────┘                               │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 3. RESPONSE INTERCEPTOR (Global)                           │ │
│  │    - Wraps success responses                               │ │
│  │    - Adds success flag, timestamp, path                    │ │
│  │    - Returns standardized success response                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            │ Standardized Response
                            │
                            ▼
                    ┌─────────────────┐
                    │ Response Format │
                    │                 │
                    │ Success:        │
                    │ {               │
                    │   success: true │
                    │   statusCode    │
                    │   message       │
                    │   data          │
                    │   timestamp     │
                    │   path          │
                    │ }               │
                    │                 │
                    │ Error:          │
                    │ {               │
                    │   success: false│
                    │   statusCode    │
                    │   message       │
                    │   error: {      │
                    │     code        │
                    │     details     │
                    │   }             │
                    │   timestamp     │
                    │   path          │
                    │ }               │
                    └─────────────────┘
```

---

## Request Flow - Success Case

```
1. Client sends request
   ↓
2. Validation Pipe validates input
   ↓
3. Controller receives request
   ↓
4. Controller calls service
   ↓
5. Service processes and returns data
   ↓
6. Controller returns data
   ↓
7. Response Interceptor wraps response
   ├─ Adds success: true
   ├─ Adds statusCode: 200
   ├─ Adds message: "Success"
   ├─ Adds timestamp
   └─ Adds path
   ↓
8. Client receives standardized success response
```

---

## Request Flow - Error Case

```
1. Client sends request
   ↓
2. Validation Pipe validates input
   ├─ If invalid → throws ValidationException
   │  ↓
   │  Exception Filter catches
   │  ├─ Converts to error response
   │  ├─ Adds error code: VAL_001
   │  ├─ Adds statusCode: 400
   │  └─ Returns error response
   │  ↓
   │  Client receives error response
   │
   └─ If valid → continues
      ↓
3. Controller receives request
   ↓
4. Controller calls service
   ↓
5. Service throws exception
   ├─ NotFoundException
   ├─ ConflictException
   ├─ BusinessLogicException
   ├─ Or any other exception
   ↓
6. Exception Filter catches exception
   ├─ Identifies exception type
   ├─ Gets error code
   ├─ Gets HTTP status code
   ├─ Gets error message
   ├─ Formats response
   └─ Returns error response
   ↓
7. Client receives standardized error response
```

---

## Exception Hierarchy

```
Exception
│
├─ HttpException (NestJS built-in)
│  │
│  └─ ApiException (Custom)
│     │
│     ├─ ValidationException
│     │  └─ Used for: Input validation failures
│     │
│     ├─ NotFoundException
│     │  └─ Used for: Resource not found (404)
│     │
│     ├─ UnauthorizedException
│     │  └─ Used for: Authentication failures (401)
│     │
│     ├─ ForbiddenException
│     │  └─ Used for: Authorization failures (403)
│     │
│     ├─ ConflictException
│     │  └─ Used for: Resource conflicts (409)
│     │
│     ├─ BusinessLogicException
│     │  └─ Used for: Business rule violations (422)
│     │
│     └─ RateLimitException
│        └─ Used for: Rate limiting (429)
│
├─ Prisma Errors
│  ├─ P2002: Unique constraint violation → ConflictException
│  ├─ P2025: Record not found → NotFoundException
│  └─ Other: Database error → SRV_002
│
└─ Generic Errors
   └─ Caught and converted to standardized format
```

---

## Error Code Mapping

```
Error Type              Error Code    HTTP Status    Exception Class
─────────────────────────────────────────────────────────────────────
Unauthorized            AUTH_001      401            UnauthorizedException
Forbidden               AUTH_002      403            ForbiddenException
Invalid Credentials     AUTH_003      401            UnauthorizedException
Token Expired           AUTH_004      401            UnauthorizedException
Token Invalid           AUTH_005      401            UnauthorizedException
Session Expired         AUTH_006      401            UnauthorizedException

Validation Failed       VAL_001       400            ValidationException
Invalid Input           VAL_002       400            ValidationException
Missing Field           VAL_003       400            ValidationException
Invalid Format          VAL_004       400            ValidationException

Not Found               RES_001       404            NotFoundException
Resource Not Found      RES_002       404            NotFoundException
Already Exists          RES_003       409            ConflictException

Business Logic Error    BIZ_001       422            BusinessLogicException
Invalid State           BIZ_002       422            BusinessLogicException
Operation Not Allowed   BIZ_003       422            BusinessLogicException
Insufficient Perms      BIZ_004       403            ForbiddenException
Quota Exceeded          BIZ_005       429            RateLimitException

Internal Server Error   SRV_001       500            ApiException
Database Error          SRV_002       500            ApiException
External Service Error  SRV_003       502            ApiException
Service Unavailable     SRV_004       503            ApiException

File Upload Failed      FILE_001      400            ApiException
File Too Large          FILE_002      413            ApiException
Invalid File Type       FILE_003      400            ApiException
File Not Found          FILE_004      404            NotFoundException

Rate Limit Exceeded     RATE_001      429            RateLimitException
Too Many Requests       RATE_002      429            RateLimitException
```

---

## Component Responsibilities

### 1. Validation Pipe
- **Responsibility**: Validate incoming request data
- **Input**: Request body/params/query
- **Output**: Validated data or ValidationException
- **Location**: `main.ts` (global)
- **Scope**: All endpoints

### 2. Controller
- **Responsibility**: Handle HTTP requests and coordinate business logic
- **Input**: Validated request data
- **Output**: Data or exception
- **Location**: `src/modules/*/controller.ts`
- **Scope**: Specific endpoint

### 3. Service
- **Responsibility**: Implement business logic and database operations
- **Input**: Data from controller
- **Output**: Result or exception
- **Location**: `src/modules/*/service.ts`
- **Scope**: Specific domain

### 4. Global Exception Filter
- **Responsibility**: Catch all exceptions and format error responses
- **Input**: Any exception
- **Output**: Standardized error response
- **Location**: `src/common/filters/http-exception.filter.ts`
- **Scope**: All endpoints

### 5. Response Interceptor
- **Responsibility**: Wrap successful responses in standard format
- **Input**: Controller return value
- **Output**: Standardized success response
- **Location**: `src/common/interceptors/transform.interceptor.ts`
- **Scope**: All endpoints

---

## Data Flow Examples

### Example 1: Get User by ID (Success)

```
GET /api/v1/users/123

1. Validation Pipe
   └─ Validates ID format ✓

2. Controller: getUser(id: '123')
   └─ Calls userService.findById('123')

3. Service: findById('123')
   └─ Queries database
   └─ Returns user object

4. Controller
   └─ Returns user object

5. Response Interceptor
   └─ Wraps in ApiResponseDto
   └─ Adds success: true, statusCode: 200, timestamp, path

6. Response sent to client:
   {
     "success": true,
     "statusCode": 200,
     "message": "Success",
     "data": { id: "123", name: "John", email: "john@example.com" },
     "timestamp": "2024-01-15T10:30:45.123Z",
     "path": "/api/v1/users/123"
   }
```

### Example 2: Get User by ID (Not Found)

```
GET /api/v1/users/invalid

1. Validation Pipe
   └─ Validates ID format ✓

2. Controller: getUser(id: 'invalid')
   └─ Calls userService.findById('invalid')

3. Service: findById('invalid')
   └─ Queries database
   └─ Returns null

4. Controller
   └─ Checks if user is null
   └─ Throws new NotFoundException('User not found')

5. Exception Filter catches NotFoundException
   └─ Gets error code: RES_002
   └─ Gets HTTP status: 404
   └─ Gets message: "The requested resource does not exist"
   └─ Formats error response

6. Response sent to client:
   {
     "success": false,
     "statusCode": 404,
     "message": "The requested resource does not exist",
     "error": {
       "code": "RES_002",
       "details": null
     },
     "timestamp": "2024-01-15T10:30:45.123Z",
     "path": "/api/v1/users/invalid"
   }
```

### Example 3: Create User (Validation Error)

```
POST /api/v1/users
Body: { name: "John" }  // Missing email

1. Validation Pipe
   └─ Validates CreateUserDto
   └─ Email is required but missing
   └─ Throws BadRequestException with validation errors

2. Exception Filter catches BadRequestException
   └─ Detects validation errors
   └─ Gets error code: VAL_001
   └─ Gets HTTP status: 400
   └─ Formats validation errors as details

3. Response sent to client:
   {
     "success": false,
     "statusCode": 400,
     "message": "Validation failed. Please check your input.",
     "error": {
       "code": "VAL_001",
       "details": [
         {
           "property": "email",
           "constraints": {
             "isEmail": "email must be an email"
           }
         }
       ]
     },
     "timestamp": "2024-01-15T10:30:45.123Z",
     "path": "/api/v1/users"
   }
```

### Example 4: Create User (Conflict)

```
POST /api/v1/users
Body: { email: "existing@example.com", name: "John" }

1. Validation Pipe
   └─ Validates CreateUserDto ✓

2. Controller: createUser(createUserDto)
   └─ Checks if user exists
   └─ User exists!
   └─ Throws new ConflictException('User with this email already exists')

3. Exception Filter catches ConflictException
   └─ Gets error code: RES_003
   └─ Gets HTTP status: 409
   └─ Gets message: "Resource already exists"

4. Response sent to client:
   {
     "success": false,
     "statusCode": 409,
     "message": "User with this email already exists",
     "error": {
       "code": "RES_003",
       "details": null
     },
     "timestamp": "2024-01-15T10:30:45.123Z",
     "path": "/api/v1/users"
   }
```

---

## Integration Points

### With Prisma
```
Service calls Prisma
├─ Success: Returns data
└─ Error: Throws Prisma error
   └─ Exception Filter catches
   └─ Converts P2002 → ConflictException
   └─ Converts P2025 → NotFoundException
   └─ Converts other → Database error
```

### With class-validator
```
Validation Pipe validates DTO
├─ Success: Passes to controller
└─ Error: Throws ValidationException
   └─ Exception Filter catches
   └─ Formats validation errors
   └─ Returns VAL_001 error code
```

### With NestJS Guards
```
Guard checks authorization
├─ Success: Allows request
└─ Error: Throws UnauthorizedException
   └─ Exception Filter catches
   └─ Returns AUTH_001 error code
```

---

## Response Interceptor Details

```
TransformInterceptor
│
├─ Intercepts all responses
│
├─ Checks if data is already ApiResponseDto
│  ├─ If yes: Returns as is
│  └─ If no: Wraps in ApiResponseDto
│
├─ Adds:
│  ├─ success: true
│  ├─ statusCode: 200 (or actual status)
│  ├─ message: "Success"
│  ├─ timestamp: ISO string
│  └─ path: request URL
│
└─ Returns standardized response
```

---

## Exception Filter Details

```
GlobalExceptionFilter
│
├─ Catches all exceptions
│
├─ Identifies exception type:
│  ├─ HttpException (including ApiException)
│  ├─ Prisma Error
│  ├─ Generic Error
│  └─ Unknown Error
│
├─ Extracts information:
│  ├─ Error code
│  ├─ HTTP status code
│  ├─ Error message
│  └─ Error details
│
├─ Formats response:
│  ├─ success: false
│  ├─ statusCode: HTTP status
│  ├─ message: Error message
│  ├─ error: { code, details }
│  ├─ timestamp: ISO string
│  └─ path: request URL
│
└─ Returns error response
```

---

## Summary

The architecture ensures:

✅ **Consistency** - All responses follow the same format  
✅ **Centralization** - Error handling in one place  
✅ **Separation of Concerns** - Each component has a single responsibility  
✅ **Extensibility** - Easy to add new error types  
✅ **Maintainability** - Changes in one place affect all endpoints  
✅ **Testability** - Easy to test error handling  
✅ **Frontend Friendly** - Predictable response structure  
✅ **Production Ready** - Handles all error types  
