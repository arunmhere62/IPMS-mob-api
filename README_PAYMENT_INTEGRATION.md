# CCAvenue Payment Integration — IPMS Mobile App

## Overview

Subscription payments are processed via **CCAvenue** payment gateway. The flow involves:
- React Native frontend (WebView)
- NestJS backend (subscription module)
- CCAvenue hosted payment page
- Deep link (`pgapp://`) to return result to the app

---

## Environment Variables (Backend)

File: `IPMS-mob-api/.env`

```env
CCAVENUE_MERCHANT_ID=your_merchant_id
CCAVENUE_ACCESS_CODE=your_access_code
CCAVENUE_WORKING_KEY=your_working_key

# Test environment
CCAVENUE_PAYMENT_URL=https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction

# Production environment
# CCAVENUE_PAYMENT_URL=https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction

# Must be a publicly accessible URL (production or ngrok for local testing)
CCAVENUE_REDIRECT_URL=https://mobapi.indianpgmanagement.com/api/v1/subscription/payment/callback
CCAVENUE_CANCEL_URL=https://mobapi.indianpgmanagement.com/api/v1/subscription/payment/cancel
```

---

## Deep Link Registration (Frontend)

File: `IPMS-mob-ui/app.config.js`

```js
intentFilters: [
  {
    action: "VIEW",
    data: [{ scheme: "pgapp", host: "payment-result" }]
  }
]
```

This registers `pgapp://payment-result` as your app's deep link scheme so Android/iOS open the app when CCAvenue redirects to it.

---

## Full Payment Flow

```
1. User selects a plan → taps "Subscribe"
        │
        ▼
2. POST /api/v1/subscription/subscribe
   Body: { plan_id }
   Headers: x-user-id, x-organization-id
        │
        ▼ (Backend)
   - Validates CCAvenue config
   - Creates user_subscriptions (status=PENDING)
   - Creates subscription_payments (status=INITIATED)
   - Encrypts payment data with WORKING_KEY (AES-128-CBC)
   - Returns: { payment_url, order_id, subscription_id, plan }
        │
        ▼
3. App navigates to PaymentOptionsScreen
   User selects payment method → PaymentWebViewScreen
        │
        ▼
4. WebView loads CCAvenue hosted payment page (payment_url)
        │
        ▼
5. User completes payment on CCAvenue
        │
        ├── SUCCESS / FAILURE
        │       │
        │       ▼
        │   CCAvenue POSTs encResp to:
        │   POST /api/v1/subscription/payment/callback
        │       │
        │       ▼ (Backend)
        │   - Decrypts encResp using AES-128-CBC
        │   - Parses: order_id, order_status, tracking_id
        │   - Idempotency check (already SUCCESS/FAILURE → skip)
        │   - Updates subscription_payments.status = SUCCESS | FAILURE
        │   - If SUCCESS: updates user_subscriptions.status = ACTIVE
        │                 sets start_date, end_date
        │   - If UPGRADE: cancels old subscription, activates new one
        │   - If FAILURE: cancels user_subscriptions (status=CANCELLED)
        │   - Returns result with orderStatus
        │       │
        │       ▼
        │   Backend redirects 302 →
        │   pgapp://payment-result?orderId=...&status=Success|Failure|Aborted
        │
        └── CANCEL (user presses back on CCAvenue)
                │
                ▼
            CCAvenue POSTs to:
            POST /api/v1/subscription/payment/cancel
                │
                ▼
            Backend redirects 302 →
            pgapp://payment-result?status=Aborted

        ▼ (both paths)
6. OS intercepts pgapp:// → opens app
        │
        ├── WebView.onShouldStartLoadWithRequest catches pgapp:// URL
        │   (handles case where WebView is still open)
        │
        └── Linking.addEventListener catches pgapp:// URL
            (handles case where app was backgrounded during UPI payment)
        │
        ▼
7. handlePaymentResult(status) called (idempotent via paymentDoneRef)
        │
        ├── Success → Alert "Payment Successful!" → navigate to Settings
        ├── Aborted → Alert "Payment Cancelled" → goBack()
        └── Failure → Alert "Payment Failed" → goBack()
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/subscription/plans` | Public | Get all active plans |
| GET | `/subscription/status` | Bearer | Check active subscription |
| GET | `/subscription/current` | Bearer | Get current subscription |
| GET | `/subscription/history` | Bearer | Get subscription history |
| POST | `/subscription/subscribe` | Bearer | Initiate new subscription |
| POST | `/subscription/upgrade` | Bearer | Upgrade existing subscription |
| POST | `/subscription/payment/callback` | Public (CCAvenue) | Payment result callback |
| GET | `/subscription/payment/callback` | Public (CCAvenue) | Payment result callback (GET) |
| POST | `/subscription/payment/cancel` | Public (CCAvenue) | Payment cancel callback |
| GET | `/subscription/payment/cancel` | Public (CCAvenue) | Payment cancel callback (GET) |
| POST | `/subscription/payment/verify-manual` | Public | Manual activation (debug only) |
| GET | `/subscription/test-ccavenue` | Public | Test CCAvenue config |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Available plans (name, price, duration, limits) |
| `user_subscriptions` | Per-org subscriptions (status: PENDING→ACTIVE/CANCELLED/EXPIRED) |
| `subscription_payments` | Payment records (status: INITIATED→SUCCESS/FAILURE/ABORTED) |

### subscription_payments.status values
- `INITIATED` — Order created, user hasn't paid yet
- `SUCCESS` — CCAvenue confirmed payment
- `FAILURE` — CCAvenue reported failure
- `ABORTED` — User cancelled on CCAvenue page

### user_subscriptions.status values
- `PENDING` — Payment initiated, not yet confirmed
- `ACTIVE` — Payment successful, subscription live
- `CANCELLED` — Payment failed or user cancelled
- `EXPIRED` — end_date passed (auto-updated on status check)

---

## GST Calculation

All prices shown to users include 18% GST (9% CGST + 9% SGST):

```
base_price = plan.price
cgst = base_price × 9%
sgst = base_price × 9%
total_charged = base_price + cgst + sgst
```

---

## Encryption

CCAvenue uses **AES-128-CBC** encryption:
- **Encrypt**: payment request data → sent as `encRequest`
- **Decrypt**: CCAvenue's `encResp` → parsed for order_id, order_status etc.
- Key: `CCAVENUE_WORKING_KEY` (from .env)

---

## Testing Locally

### Option 1: ngrok (Recommended)
```bash
ngrok http 3001
# Copy the HTTPS URL, update .env:
CCAVENUE_REDIRECT_URL=https://xxxx.ngrok-free.app/api/v1/subscription/payment/callback
CCAVENUE_CANCEL_URL=https://xxxx.ngrok-free.app/api/v1/subscription/payment/cancel
CCAVENUE_PAYMENT_URL=https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction
```

### Option 2: ₹1 Test Plan in Production
Insert a low-value plan directly in the DB:
```sql
INSERT INTO subscription_plans (name, description, duration, price, currency,
  max_pg_locations, max_tenants, max_rooms, max_beds, is_active, created_at, updated_at)
VALUES ('Test Plan ₹1', 'For payment testing', 30, 1.00, 'INR', 999, 999, 999, 999, true, NOW(), NOW());
```
Then use production URLs and real CCAvenue credentials. Charges ₹1 to your card.

### Debug Endpoints
```
GET /api/v1/subscription/test-ccavenue
→ Returns config status (merchant ID, key lengths, URLs)

POST /api/v1/subscription/payment/verify-manual
Body: { "order_id": "SUB_34_1_1234567890" }
→ Manually activates subscription (for testing when callback fails)
```

---

## Known Issues Fixed

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| "Cancel Payment?" shown after success | Backend returned HTML instead of redirecting to deep link; WebView stayed open | Changed callback to `res.redirect(302, pgapp://...)` |
| DB status stuck at INITIATED | `orderStatus` not included in service return; controller read wrong field | Added `orderStatus` to `handlePaymentCallback` return value |
| Cancel dialog shown on back-press after success | `paymentDoneRef` not checked in `handleBackPress` | `paymentDoneRef.current = true` set immediately in `handlePaymentResult` |
| pgapp:// URL not intercepted | `onShouldStartLoadWithRequest` missing deep link check | Added `pgapp://payment-result` interception before UPI URL checks |

---

## Frontend Files

| File | Purpose |
|------|---------|
| `src/screens/subscription/SubscriptionPlansScreen.tsx` | Plan listing |
| `src/screens/subscription/PaymentOptionsScreen.tsx` | Payment method selection |
| `src/screens/subscription/PaymentWebViewScreen.tsx` | WebView + deep link handler |

## Backend Files

| File | Purpose |
|------|---------|
| `src/modules/subscription/subscription.controller.ts` | Route handlers + CCAvenue callbacks |
| `src/modules/subscription/subscription.service.ts` | Business logic, encryption, DB updates |
