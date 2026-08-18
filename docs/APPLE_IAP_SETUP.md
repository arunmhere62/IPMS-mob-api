# Apple In-App Purchase — Setup & Deployment Notes

This document covers the one-time setup required to make Apple IAP work end-to-end
for the IPMS mobile app. Code is already implemented; these are the manual steps.

## Why this exists

App Store Guideline 3.1.1 requires paid digital subscriptions offered inside the
iOS app to be sold via Apple In-App Purchase (StoreKit 2). Android continues to
use CCAvenue. See:
- `IPMS-mob-ui/src/config/iapProducts.ts`
- `IPMS-mob-ui/src/hooks/useIAPSubscription.ts`
- `IPMS-mob-api/src/modules/subscription/iap.service.ts`

---

## 1. App Store Connect — Create IAP Products

1. Open App Store Connect → your app → **Monetization → Subscriptions**.
2. Create a **Subscription Group** named `IPMS Plans`.
3. Inside the group, create **4 auto-renewable subscription products** with these
   exact Product IDs (must match `iapProducts.ts`):

   | Product ID                                      | Reference Name | Subscription Duration |
   |-------------------------------------------------|----------------|------------------------|
   | `com.indianpgmanagement.sub.monthly`            | Monthly        | 1 Month                |
   | `com.indianpgmanagement.sub.quarterly`          | Quarterly      | 3 Months               |
   | `com.indianpgmanagement.sub.halfyearly`         | Half-Yearly    | 6 Months               |
   | `com.indianpgmanagement.sub.yearly`             | Yearly         | 1 Year                 |

4. For each product:
   - Set the price tier (match your existing CCAvenue pricing, in INR).
   - Add a localization (en-IN) with display name and description.
   - Upload a review screenshot of the subscription screen.
   - Save.

5. **Submit the IAPs for review** alongside the next app binary. IAPs are
   reviewed together with the app — they won't go live until approved.

---

## 2. App Store Connect — In-App Purchase Key (for server-side validation)

1. App Store Connect → **Users and Access → Integrations → In-App Purchase**.
2. Click **Generate In-App Purchase Key**.
3. Download the `.p8` private key file. **Keep this secret — it cannot be re-downloaded.**
4. Note the **Key ID**, **Issuer ID** (shown on the same page).

These map to env vars (see step 4 below).

---

## 3. App Store Connect — App Store Server Notifications V2

1. App Store Connect → your app → **App Information → App Store Server Notifications**.
2. Set **Version** to **V2**.
3. Set **Production URL** to:
   ```
   https://mobapi.indianpgmanagement.com/api/v1/subscription/iap/notifications
   ```
4. Set **Sandbox URL** to the same URL (the endpoint auto-detects environment).
5. Save.

This lets Apple notify your server about renewals, cancellations, refunds, and
billing issues — even when the app is not open.

---

## 4. Server Environment Variables

Add these to the API server's environment (Render/Vercel/pm2 `.env`):

```env
# Apple In-App Purchase (server-side receipt validation)
APPLE_IAP_BUNDLE_ID=com.indianpgmanagement.app
APPLE_IAP_APP_APPLE_ID=1234567890          # numeric App Apple ID from App Store Connect
APPLE_IAP_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_IAP_KEY_ID=XXXXXXXXXX
APPLE_IAP_PRIVATE_KEY_PATH=/opt/ipms/secrets/AuthKey_XXXXXXXXXX.p8
APPLE_IAP_ENVIRONMENT=production           # use 'sandbox' for dev/testing
```

- Place the `.p8` file at the path specified by `APPLE_IAP_PRIVATE_KEY_PATH`.
- For the **dev** environment, use `APPLE_IAP_ENVIRONMENT=sandbox` and the
  sandbox notification URL.

---

## 5. Apple Root CA Certificates (for S2S notification verification)

The `SignedDataVerifier` needs Apple's root CA certificates to verify the JWS
signature on Server Notifications V2 and StoreKit 2 transactions.

1. Download these from https://www.apple.com/certificateauthority/:
   - `AppleRootCA-G2.cer`
   - `AppleRootCA-G3.cer`
   - `AppleComputerRootCertificate.cer`
   - `AppleIncRootCertificate.cer`
2. Place the `.cer` files in:
   ```
   IPMS-mob-api/certs/apple-root-cas/
   ```
3. Restart the API server. The `IapService` loads them automatically on boot.

Without these, S2S notification verification will fail and the server will log
a warning. Receipt validation via the `/iap/validate` endpoint also relies on
the verifier, so this is required for production.

---

## 6. Plan ID Mapping (IMPORTANT)

The backend maps Apple product IDs to `subscription_plans` rows by **duration**
(30/90/180/365 days). It picks the first active, non-free, non-trial plan with
the matching duration.

**Before going live**, verify your `subscription_plans` table has exactly one
active paid plan for each of these durations:
- 30 days (Monthly)
- 90 days (Quarterly)
- 180 days (Half-Yearly)
- 365 days (Yearly)

If you have multiple paid plans with the same duration, the cheapest one will
be selected. To make the mapping explicit, ensure only one active paid plan
exists per duration.

The client-side mapping in `iapProducts.ts` (`IAP_PRODUCT_TO_PLAN_ID`) is a
reference; the server does its own lookup by duration, so the client values
can stay as placeholders (0).

---

## 7. Testing

### Sandbox testing
1. In App Store Connect → **Users and Access → Sandbox → Testers**, create a
   sandbox tester account.
2. On the iOS device, sign out of your real Apple ID in **Settings → App Store**
   (keep the account signed in to iCloud — only sign out of the App Store).
3. Run the app via EAS dev build (`eas build -p ios --profile development`).
4. On the Subscription Plans screen, tap **Get Started** on a paid plan.
5. The StoreKit sheet appears with sandbox pricing. Complete the purchase.
6. The app sends the JWS token to `/subscription/iap/validate`. The server
   verifies it and activates the subscription.
7. Verify in the DB: `user_subscriptions` should have a new ACTIVE row with
   `subscription_payments.tracking_id` = the Apple transaction id and
   `payment_mode` = `APPLE_IAP`.

### StoreKit Configuration file (local testing without sandbox)
For faster iteration in Xcode, you can create a `.storekit` configuration file
and test purchases locally without a network. This is optional — sandbox
testing is sufficient for App Review.

### Renewal testing
Sandbox subscriptions renew quickly (e.g., 1-month renews every 5 minutes, up
to 6 times). Watch the server logs for `Apple S2S notification: type=DID_RENEW`
to confirm renewals extend the `end_date` automatically.

---

## 8. App Review Information

When submitting to App Store, fill in the **App Review Information** section:

- **IAP Products**: list the 4 product IDs above.
- **Demo Account**: provide a sandbox tester account if login is required.
- **Subscription Terms**: state the durations, prices, and that subscriptions
  auto-renew unless cancelled at least 24 hours before the period ends.
- **Restore Purchases**: mention the "Restore Purchases" button on the
  Subscription Plans screen.
- **Privacy Policy & Terms**: ensure your existing legal docs cover auto-renewing
  subscriptions.

---

## 9. Rollout sequence

1. Deploy the API server with the new env vars + `.p8` file + Apple Root CAs.
2. Create the IAP products in App Store Connect (step 1).
3. Configure S2S notifications URL (step 3).
4. Build the iOS app with `expo-iap` plugin (`eas build -p ios --profile production`).
5. Submit the app binary + IAP products for review together.
6. After approval, both go live simultaneously.

---

## Files changed

### Frontend (`IPMS-mob-ui`)
- `src/config/environment.ts` — added `WEB_SIGNUP_URL`
- `src/config/iapProducts.ts` — NEW: Apple IAP product ID mapping
- `src/features/auth/screens/LoginScreen.tsx` — iOS Sign Up → website
- `src/navigation/AppNavigator.tsx` — iOS no longer registers Signup routes
- `src/features/owner/api/subscriptionApi.ts` — added `validateIapReceipt` mutation
- `src/hooks/useIAPSubscription.ts` — NEW: expo-iap wrapper + receipt validation
- `src/features/owner/screens/subscription/SubscriptionPlansScreen.tsx` — iOS IAP CTA + Restore button
- `app.config.js` — added `expo-iap` plugin
- `package.json` — added `expo-iap`

### Backend (`IPMS-mob-api`)
- `src/modules/subscription/iap.service.ts` — NEW: Apple receipt validation + S2S notifications
- `src/modules/subscription/subscription.controller.ts` — added `/iap/validate` + `/iap/notifications`
- `src/modules/subscription/subscription.module.ts` — registered `IapService`
- `package.json` — added `@apple/app-store-server-library`
- `certs/apple-root-cas/.gitkeep` — NEW: place Apple Root CA .cer files here
