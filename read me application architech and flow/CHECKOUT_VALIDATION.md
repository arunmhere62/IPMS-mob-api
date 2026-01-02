# Tenant Checkout Validation - Partial Payments Restriction

## Overview
Added strict validation to the tenant checkout API to prevent tenants with **PARTIAL status payments** from being checked out. This ensures financial integrity and prevents incomplete transactions.

## Problem Statement
Previously, tenants could be checked out even if they had pending payments in PARTIAL status. This could lead to:
- Incomplete payment records
- Financial discrepancies
- Confusion about tenant payment status

## Solution Implemented

### Backend Changes

#### File: `api/src/modules/tenant/checkout/checkout.service.ts`

**Added PARTIAL Payment Validation (Lines 60-93):**

```typescript
// Check for PARTIAL status payments first (strict validation)
const partialRentPayments = tenant.rent_payments.filter(
  (payment) => payment.status === 'PARTIAL'
);
const partialAdvancePayments = tenant.advance_payments.filter(
  (payment) => payment.status === 'PARTIAL'
);
const partialRefundPayments = tenant.refund_payments.filter(
  (payment) => payment.status === 'PARTIAL'
);

const totalPartialPayments = 
  partialRentPayments.length + 
  partialAdvancePayments.length + 
  partialRefundPayments.length;

// Reject checkout if there are any PARTIAL payments
if (totalPartialPayments > 0) {
  const partialDetails = [];
  
  if (partialRentPayments.length > 0) {
    partialDetails.push(`${partialRentPayments.length} rent payment(s) with PARTIAL status`);
  }
  if (partialAdvancePayments.length > 0) {
    partialDetails.push(`${partialAdvancePayments.length} advance payment(s) with PARTIAL status`);
  }
  if (partialRefundPayments.length > 0) {
    partialDetails.push(`${partialRefundPayments.length} refund payment(s) with PARTIAL status`);
  }

  throw new BadRequestException(
    `Cannot checkout tenant. Tenant has ${totalPartialPayments} payment(s) in PARTIAL status: ${partialDetails.join(', ')}. Please complete or mark all PARTIAL payments as PAID before checkout.`
  );
}
```

**Validation Flow:**
1. Fetch tenant with all payment records (rent, advance, refund)
2. **First Check:** Look for PARTIAL status payments (strict validation)
3. **If PARTIAL found:** Throw BadRequestException with detailed error message
4. **If no PARTIAL:** Check for other unpaid statuses (PENDING, FAILED, etc.)
5. **If all paid:** Allow checkout

#### File: `api/src/modules/tenant/checkout/checkout.controller.ts`

**Updated API Documentation (Lines 69-79):**

Added proper API response documentation for the 400 error:

```typescript
@ApiResponse({ 
  status: 400, 
  description: 'Cannot checkout tenant - has PARTIAL or unpaid payments',
  schema: {
    example: {
      statusCode: 400,
      message: 'Cannot checkout tenant. Tenant has 1 payment(s) in PARTIAL status: 1 rent payment(s) with PARTIAL status. Please complete or mark all PARTIAL payments as PAID before checkout.',
      error: 'Bad Request'
    }
  }
})
```

### Frontend Error Handling

#### File: `mob-ui/src/screens/tenants/TenantsScreen.tsx`

**Existing Error Handling (Lines 263-264):**

The mobile app already has proper error handling in the `confirmCheckout` function:

```typescript
catch (error: any) {
  Alert.alert('Error', error?.response?.data?.message || 'Failed to checkout tenant');
}
```

**How it works:**
- When checkout fails due to PARTIAL payments, the API returns a 400 error
- The error message is extracted from `error?.response?.data?.message`
- User sees a clear alert with the specific reason for checkout failure

## Error Response Examples

### Example 1: Single Partial Rent Payment
```json
{
  "statusCode": 400,
  "message": "Cannot checkout tenant. Tenant has 1 payment(s) in PARTIAL status: 1 rent payment(s) with PARTIAL status. Please complete or mark all PARTIAL payments as PAID before checkout.",
  "error": "Bad Request"
}
```

### Example 2: Multiple Partial Payments
```json
{
  "statusCode": 400,
  "message": "Cannot checkout tenant. Tenant has 3 payment(s) in PARTIAL status: 2 rent payment(s) with PARTIAL status, 1 advance payment(s) with PARTIAL status. Please complete or mark all PARTIAL payments as PAID before checkout.",
  "error": "Bad Request"
}
```

### Example 3: Unpaid Payments (After PARTIAL Check)
```json
{
  "statusCode": 400,
  "message": "Cannot checkout tenant. There are 2 unpaid payment(s): 2 rent payment(s). Please mark all payments as PAID before checkout.",
  "error": "Bad Request"
}
```

## Checkout Requirements

A tenant can only be checked out if **ALL** of the following conditions are met:

1. ✅ **No PARTIAL status payments** (rent, advance, or refund)
2. ✅ **No unpaid payments** (all payments must be PAID status)
3. ✅ **Tenant exists and is not deleted**
4. ✅ **Valid checkout date provided** (or defaults to current date)

## API Endpoint

**POST** `/api/v1/tenants/:id/checkout`

**Required Headers:**
- `x-pg-id` (pg_id)
- `x-organization-id` (organization_id)
- `x-user-id` (user_id)

**Request Body:**
```json
{
  "check_out_date": "2025-11-15"  // Optional, defaults to current date
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Tenant checked out successfully",
  "data": {
    "s_no": 1,
    "name": "John Doe",
    "status": "INACTIVE",
    "check_out_date": "2025-11-15T00:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "statusCode": 400,
  "message": "Cannot checkout tenant. Tenant has X payment(s) in PARTIAL status: ...",
  "error": "Bad Request"
}
```

## Testing Checklist

- [ ] Try to checkout tenant with PARTIAL rent payment → Should fail with clear message
- [ ] Try to checkout tenant with PARTIAL advance payment → Should fail with clear message
- [ ] Try to checkout tenant with PARTIAL refund payment → Should fail with clear message
- [ ] Try to checkout tenant with multiple PARTIAL payments → Should list all in error message
- [ ] Try to checkout tenant with only unpaid (non-PARTIAL) payments → Should fail with different message
- [ ] Try to checkout tenant with all payments PAID → Should succeed
- [ ] Verify error message displays correctly in mobile app alert

## User Experience Flow

### Scenario 1: Tenant with Partial Payment
1. User navigates to Tenants screen
2. User clicks checkout button on a tenant
3. Checkout date modal appears
4. User confirms checkout
5. **API returns 400 error with message about PARTIAL payments**
6. **Mobile app shows alert:** "Cannot checkout tenant. Tenant has 1 payment(s) in PARTIAL status: 1 rent payment(s) with PARTIAL status. Please complete or mark all PARTIAL payments as PAID before checkout."
7. User must complete/mark the partial payment before retrying checkout

### Scenario 2: Successful Checkout
1. User navigates to Tenants screen
2. User clicks checkout button on a tenant
3. Checkout date modal appears
4. User confirms checkout
5. **API returns 200 success**
6. **Mobile app shows alert:** "Success - Tenant checked out successfully"
7. Tenant list refreshes with updated status

## Files Modified

1. **Backend:**
   - `api/src/modules/tenant/checkout/checkout.service.ts` - Added PARTIAL payment validation
   - `api/src/modules/tenant/checkout/checkout.controller.ts` - Updated API documentation

2. **Frontend:**
   - No changes needed (error handling already in place)

## Benefits

✅ **Financial Integrity:** Prevents incomplete transactions  
✅ **Clear User Feedback:** Specific error messages about what needs to be fixed  
✅ **Data Consistency:** Ensures all payments are properly recorded before checkout  
✅ **Better UX:** Users know exactly why checkout failed and what to do next  
✅ **Audit Trail:** Checkout only happens when all payments are properly settled
