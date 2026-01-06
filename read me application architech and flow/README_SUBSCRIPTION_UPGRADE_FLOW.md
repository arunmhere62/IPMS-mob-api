# Subscription Upgrade Flow (Architecture)

## Goal
Support upgrading from an ACTIVE subscription plan to another plan in a safe, auditable way, reusing the existing payment flow (payment URL -> webview -> gateway callback/webhook).

This document defines:
- Business rules for upgrades
- Data invariants (what must always be true)
- API endpoints and expected behavior
- Payment/webhook finalization logic
- Mobile UI behavior
- Rollout/testing checklist

---

## Current System (Existing)
### Core tables (Prisma)
- `subscription_plans`
  - plan metadata (price, duration), flags (`is_free`, `is_trial`, `is_active`), and limits.
- `user_subscriptions`
  - `organization_id`, `user_id`, `plan_id`
  - `status`: `ACTIVE | EXPIRED | CANCELLED | PENDING`
  - `start_date`, `end_date`
  - `is_trial`, `auto_renew`
- `subscription_payments`
  - payment/order tracking (`order_id`, `tracking_id`, `bank_ref_no`, `status`, `amount`, etc.)
  - `subscription_id` (nullable), `plan_id`, plus `metadata`

### Existing subscribe experience (mobile)
- Mobile initiates subscription purchase and expects a `payment_url`
- App opens `PaymentWebView` for payment
- Backend finalizes subscription based on payment gateway callback/webhook

---

## Upgrade Types (Choose One)
### Option A (Recommended to implement first): Immediate upgrade, no proration
- User upgrades now.
- New subscription becomes ACTIVE immediately after payment success.
- Old ACTIVE subscription is cancelled/expired at the same time.
- User pays full price of the new plan.

### Option B: Immediate upgrade with proration/credit
- Compute remaining value of old plan as credit.
- User pays `max(newPlanPrice - credit, 0)`.

### Option C: Scheduled upgrade at renewal
- New plan starts when current subscription ends.
- No proration/credit math.

This README assumes **Option A** for a clean first release.

---

## Business Rules (Option A)
### Allowed transitions
- Only upgrade if there is a current ACTIVE subscription for the organization.
- `newPlanId` must be different from current plan.
- `newPlan` must have `is_active = true`.

### Trial behavior (recommended)
- If current subscription is trial:
  - Upgrading is allowed.
  - Trial is forfeited (no credit).
  - New plan starts immediately on successful payment.

### Free plan behavior
- If `newPlan.is_free = true`, upgrade can be instant (no payment), but still should go through the same “finalize” path to keep behavior consistent.

---

## Data Invariants (Must Always Hold)
- Per `organization_id`, at most **one** subscription can be `ACTIVE` at any time.
- Payment records are immutable audit logs: do not delete.
- A subscription should not become `ACTIVE` until payment is verified as successful.

---

## Minimal DB / Modeling Strategy
### Minimal approach (no schema changes)
Use `subscription_payments.metadata` to track upgrade intent:
```json
{
  "action": "UPGRADE",
  "from_subscription_id": 123,
  "to_plan_id": 7
}
```

### Recommended improvement (later)
Add a link on `user_subscriptions`:
- `upgraded_from_subscription_id Int?`

This makes upgrade lineage queryable without parsing metadata.

---

## API Contract
### 1) Initiate upgrade
**Endpoint**: `POST /subscription/upgrade`

**Auth**: same as subscribe.

**Body**:
```json
{ "plan_id": 7 }
```

**Server logic (high level)**
1. Read `organization_id` and `user_id` from auth context.
2. Fetch current ACTIVE subscription for this org.
3. Validate `plan_id` exists and is active.
4. Create a new `user_subscriptions` record:
   - `status = PENDING`
   - `plan_id = newPlanId`
   - `organization_id`, `user_id`
   - `start_date = now` (or keep as now; activation is controlled by `status`)
   - `end_date` can be placeholder until activation
5. Create `subscription_payments` record:
   - `subscription_id = newSubscriptionId`
   - `plan_id = newPlanId`
   - `amount = newPlan.price` (Option A)
   - `metadata.action = UPGRADE`, `metadata.from_subscription_id = oldSubscriptionId`
6. Initiate gateway order and return `payment_url`.

**Response** (shape should match your existing subscribe response as much as possible):
```json
{
  "data": {
    "payment_url": "https://...",
    "order_id": "...",
    "subscription_id": 456
  }
}
```

### 2) Finalize payment (callback/webhook)
Wherever you currently mark payments as SUCCESS/FAILED, add the upgrade finalization:

**On payment SUCCESS**
- Mark payment `SUCCESS`.
- Load the `subscription_payments.subscription_id` (the new subscription).
- Read `metadata.from_subscription_id`.
- In a **single transaction**:
  - Set old subscription:
    - `status = CANCELLED` (or EXPIRED)
    - `end_date = now`
  - Set new subscription:
    - `status = ACTIVE`
    - `start_date = now`
    - `end_date = now + plan.duration`

**On payment FAILURE**
- Mark payment failed.
- Mark the new subscription as `CANCELLED` (or keep PENDING but that creates clutter).
- Keep the old subscription unchanged (still ACTIVE).

---

## Concurrency & Safety
### Prevent double-active subscriptions
- Use DB transaction in finalize step.
- Consider an application-level guard:
  - before activating new subscription, ensure no other ACTIVE exists (besides the old one being cancelled in the same transaction).

### Idempotency
Gateway callbacks can be repeated.
- If payment already marked SUCCESS, do nothing.
- If new subscription already ACTIVE and old already CANCELLED, do nothing.

---

## Mobile UI Behavior
### Screen: SubscriptionPlansScreen
Decision tree:
- If user has **no ACTIVE** subscription:
  - Primary button: `Subscribe`
  - Calls existing `subscribeToPlan({ planId })`
- If user has an **ACTIVE** subscription:
  - For the current plan card:
    - Button disabled: `Current Plan`
  - For other plan cards:
    - Button label: `Upgrade`
    - Calls new `upgradePlan({ planId })`

After calling `subscribe/upgrade`:
- If response includes `payment_url`, open `PaymentWebView`.
- On returning from webview, refresh subscription status.

---

## Testing Checklist
- Upgrade from Paid -> Paid
- Upgrade from Trial -> Paid
- Upgrade from Paid -> Free (if supported)
- Payment success path (old cancelled, new active)
- Payment failure path (old remains active, new cancelled)
- Repeated webhook calls are idempotent
- Ensure counts/limits enforcement uses ACTIVE subscription plan after upgrade

---

## Rollout Notes
- Start with Option A (no proration). Announce behavior clearly in UI.
- Later, introduce proration by adjusting `amount` calculation and storing credit breakdown in payment metadata.
