# Current Bill API Documentation

## Overview
The Current Bill API allows you to manage current bills for tenants. It supports two modes of bill creation:
1. **Room-based bill splitting**: Split a bill equally among all active tenants in a room
2. **Individual tenant bills**: Create bills for specific tenants

## Schema
```
model current_bills {
  s_no            Int               @id @default(autoincrement())
  tenant_id       Int
  tenant_rent_id  Int
  pg_id           Int
  bill_amount     Decimal           @db.Decimal(10, 2)
  bill_date       DateTime          @default(now()) @db.Timestamp(0)
  created_at      DateTime          @default(now()) @db.Timestamp(0)
  updated_at      DateTime          @default(now()) @db.Timestamp(0)
  is_deleted      Boolean?          @default(false)
  pg_locations    pg_locations      @relation(...)
  tenants         tenants           @relation(...)
  rent_payments rent_payments[]
}
```

## API Endpoints

### 1. Create Current Bill
**POST** `/current-bills`

#### Mode 1: Split Bill for a Room
Create a bill for a room and split it equally among all active tenants in that room.

**Request Body:**
```json
{
  "room_id": 1,
  "pg_id": 1,
  "bill_amount": 3000,
  "bill_date": "2024-01-01",
  "split_equally": true,
  "remarks": "Electricity bill for January"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Current bill created and split equally among 3 tenant(s)",
  "data": {
    "bills": [
      {
        "s_no": 1,
        "tenant_id": 1,
        "pg_id": 1,
        "bill_amount": 1000,
        "bill_date": "2024-01-01T00:00:00Z",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "tenants": {
          "s_no": 1,
          "tenant_id": "T001",
          "name": "John Doe"
        },
        "pg_locations": {
          "s_no": 1,
          "location_name": "Downtown PG"
        }
      },
      // ... more bills for other tenants
    ],
    "total_bill_amount": 3000,
    "bill_per_tenant": 1000,
    "tenant_count": 3,
    "bill_date": "2024-01-01T00:00:00Z"
  }
}
```

#### Mode 2: Individual Tenant Bill
Create a bill for a specific tenant.

**Request Body:**
```json
{
  "tenant_id": 1,
  "pg_id": 1,
  "bill_amount": 1500,
  "bill_date": "2024-01-01",
  "remarks": "Water bill for January"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Current bill created successfully for tenant",
  "data": {
    "s_no": 4,
    "tenant_id": 1,
    "pg_id": 1,
    "bill_amount": 1500,
    "bill_date": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "tenants": {
      "s_no": 1,
      "tenant_id": "T001",
      "name": "John Doe",
      "phone_no": "9876543210"
    },
    "pg_locations": {
      "s_no": 1,
      "location_name": "Downtown PG"
    }
  }
}
```

### 2. Get All Current Bills
**GET** `/current-bills`

**Query Parameters:**
- `tenant_id` (optional): Filter by tenant ID
- `room_id` (optional): Filter by room ID
- `month` (optional): Filter by month name (e.g., "January")
- `year` (optional): Filter by year (e.g., 2024)
- `start_date` (optional): Filter from date (YYYY-MM-DD)
- `end_date` (optional): Filter to date (YYYY-MM-DD)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Records per page (default: 10)

**Example Request:**
```
GET /current-bills?tenant_id=1&month=January&year=2024&page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "s_no": 1,
      "tenant_id": 1,
      "pg_id": 1,
      "bill_amount": 1000,
      "bill_date": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "tenants": {
        "s_no": 1,
        "tenant_id": "T001",
        "name": "John Doe",
        "phone_no": "9876543210"
      },
      "pg_locations": {
        "s_no": 1,
        "location_name": "Downtown PG"
      }
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

### 3. Get Bills by Month and Year
**GET** `/current-bills/by-month/:month/:year`

**Path Parameters:**
- `month`: Month number (1-12)
- `year`: Year (e.g., 2024)

**Query Parameters:**
- `tenant_id` (optional): Filter by tenant ID

**Example Request:**
```
GET /current-bills/by-month/1/2024?tenant_id=1
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "s_no": 1,
      "tenant_id": 1,
      "pg_id": 1,
      "bill_amount": 1000,
      "bill_date": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "tenants": {
        "s_no": 1,
        "tenant_id": "T001",
        "name": "John Doe",
        "phone_no": "9876543210"
      },
      "pg_locations": {
        "s_no": 1,
        "location_name": "Downtown PG"
      }
    }
  ],
  "summary": {
    "month": 1,
    "year": 2024,
    "total_bills": 1,
    "total_amount": 1000
  }
}
```

### 4. Get Single Current Bill
**GET** `/current-bills/:id`

**Path Parameters:**
- `id`: Current bill ID

**Example Request:**
```
GET /current-bills/1
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "s_no": 1,
    "tenant_id": 1,
    "pg_id": 1,
    "bill_amount": 1000,
    "bill_date": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "tenants": {
      "s_no": 1,
      "tenant_id": "T001",
      "name": "John Doe",
      "phone_no": "9876543210",
      "email": "john@example.com"
    },
    "pg_locations": {
      "s_no": 1,
      "location_name": "Downtown PG",
      "address": "123 Main St"
    }
  }
}
```

### 5. Update Current Bill
**PATCH** `/current-bills/:id`

**Path Parameters:**
- `id`: Current bill ID

**Request Body:**
```json
{
  "bill_amount": 1200,
  "bill_date": "2024-01-05",
  "remarks": "Updated electricity bill"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Current bill updated successfully",
  "data": {
    "s_no": 1,
    "tenant_id": 1,
    "pg_id": 1,
    "bill_amount": 1200,
    "bill_date": "2024-01-05T00:00:00Z",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z",
    "tenants": {
      "s_no": 1,
      "tenant_id": "T001",
      "name": "John Doe",
      "phone_no": "9876543210"
    },
    "pg_locations": {
      "s_no": 1,
      "location_name": "Downtown PG"
    }
  }
}
```

### 6. Delete Current Bill
**DELETE** `/current-bills/:id`

**Path Parameters:**
- `id`: Current bill ID

**Response (200):**
```json
{
  "success": true,
  "message": "Current bill deleted successfully"
}
```

## Required Headers
All endpoints require the following headers:
- `pg_id`: PG Location ID (required)
- `organization_id`: Organization ID (optional but recommended)
- `user_id`: User ID (optional but recommended)

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Bill amount must be greater than 0",
  "error": "Bad Request"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Tenant with ID 999 not found",
  "error": "Not Found"
}
```

## Usage Examples

### Example 1: Split Electricity Bill Among Room Tenants
```bash
curl -X POST http://localhost:3000/current-bills \
  -H "Content-Type: application/json" \
  -H "pg_id: 1" \
  -d '{
    "room_id": 5,
    "pg_id": 1,
    "bill_amount": 6000,
    "bill_date": "2024-01-01",
    "split_equally": true,
    "remarks": "Electricity bill for January 2024"
  }'
```

### Example 2: Add Individual Water Bill for Tenant
```bash
curl -X POST http://localhost:3000/current-bills \
  -H "Content-Type: application/json" \
  -H "pg_id: 1" \
  -d '{
    "tenant_id": 3,
    "pg_id": 1,
    "bill_amount": 500,
    "bill_date": "2024-01-01",
    "remarks": "Water bill for January 2024"
  }'
```

### Example 3: Get All Bills for January 2024
```bash
curl -X GET "http://localhost:3000/current-bills?month=January&year=2024&page=1&limit=20" \
  -H "pg_id: 1"
```

### Example 4: Get Bills for Specific Tenant in January
```bash
curl -X GET "http://localhost:3000/current-bills/by-month/1/2024?tenant_id=3" \
  -H "pg_id: 1"
```

## Business Logic

### Bill Splitting Algorithm
When creating a room bill with `split_equally=true`:
1. Fetch all active tenants in the specified room
2. Calculate bill per tenant: `total_bill_amount / number_of_tenants`
3. Create individual bill records for each tenant
4. Link each bill to the tenant's latest rent payment

### Validation Rules
- Bill amount must be greater than 0
- Tenant must exist and not be deleted
- Room must exist and not be deleted
- For room bills, at least one active tenant must exist in the room
- Bill date defaults to current date if not provided

### Soft Delete
Bills are soft-deleted (marked as `is_deleted = true`) rather than permanently removed, preserving historical data.
