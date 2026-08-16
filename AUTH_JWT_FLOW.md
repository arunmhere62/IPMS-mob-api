# JWT Access + Refresh Token Architecture (mob-api + mob-ui)

This document describes the **production-ready authentication flow** for the mobile stack:

- **mob-api**: NestJS + Prisma (MySQL)
- **mob-ui**: Expo React Native + Redux + RTK Query

The goal is:

- Issue a **short-lived access token** for API calls.
- Issue a **long-lived refresh token** to renew access tokens.
- Support **logout**, **revocation**, and (optionally) **refresh token rotation**.

---

## 1) Current state (what already exists)

### mob-api
- OTP login exists: `POST /auth/send-otp`, `POST /auth/verify-otp`.
- Prisma has a `tokens` table.
- `JwtTokenService` exists and already:
  - Generates `access_token` and `refresh_token`.
  - Stores them in `tokens` table.
  - Can verify access token against DB (`verifyAccessToken`) and revoke (`revokeToken`).
- There is a `JwtAuthGuard`, but it currently only checks for `Bearer ...` and **does not verify**.

### mob-ui
- Auth state is persisted via `redux-persist` (AsyncStorage) in `authSlice`.
- `baseApi` already sends:
  - `Authorization: Bearer <accessToken>`
  - `x-user-id`, `x-organization-id`, `x-pg-location-id`

What's missing:
- **API**: a real guard that validates JWT + attaches `req.user`.
- **API**: refresh endpoint + logout endpoint.
- **UI**: automatic refresh + retry when access token expires.
- **UI**: a safer token storage story (recommended: SecureStore/Keychain).

---

## 2) Token types and payloads

### Access token
- Purpose: authorize every API request.
- Lifetime: short (recommended prod: `15m`–`1h`).
- Payload (example; yours already includes these fields):
  - `sub` (user id)
  - `phone`, `email`
  - `role_id`
  - `organization_id`

### Refresh token
- Purpose: obtain a new access token.
- Lifetime: longer (recommended prod: `7d`–`30d`).
- Payload:
  - `sub` (user id)

**Important**: refresh token must be treated like a password.

---

## 3) API endpoints (contract)

### A) Login via OTP
- `POST /auth/verify-otp`
- Response should include:
  - `user`
  - `access_token`
  - `refresh_token`
  - `token_type` (Bearer)
  - `expires_in` (seconds)

Your mob-ui already maps `access_token`/`refresh_token` to `accessToken`/`refreshToken`.

### B) Refresh
- `POST /auth/refresh`
- Request body:
```json
{ "refreshToken": "..." }
```
- Response:
```json
{ "access_token": "...", "refresh_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

Notes:
- If you enable **rotation**, every refresh returns a **new refresh token** and invalidates the previous one.

### C) Logout
- `POST /auth/logout`
- Requires: valid access token.
- Effect:
  - Marks token(s) as revoked in DB.
  - Client deletes stored tokens.

---

## 4) Request authentication (NestJS)

### Guard responsibility
For protected routes:
- Read `Authorization: Bearer <token>`.
- Validate signature using `JWT_SECRET`.
- Check token is not revoked in DB (your `tokens` table).
- Attach `request.user = payload`.

Recommended NestJS approach:
- `JwtStrategy` (Passport) OR a custom guard calling `JwtTokenService.verifyAccessToken`.

### Error behavior
- Invalid/expired access token => return `401 Unauthorized`.
- Revoked token => return `401 Unauthorized`.

---

## 5) Client auth flow (mob-ui)

### Storage
Recommended:
- Store tokens in **SecureStore** (`expo-secure-store`) instead of AsyncStorage.

Minimum acceptable (what you have now):
- `redux-persist` AsyncStorage

### Request flow
1. For every RTK Query request, attach `Authorization: Bearer <accessToken>`.
2. If response is `401`:
   - Call `POST /auth/refresh` with `refreshToken`.
   - If refresh succeeds: update tokens in store, retry the original request.
   - If refresh fails: logout user, clear persisted store, navigate to login.

### Concurrency control (important)
If many requests fail at once:
- Only run **one** refresh request.
- Queue/retry the others after refresh finishes.

---

## 6) Rotation + DB strategy (recommended)

Your current DB model stores one access+refresh token per user record (simple but limited).

### Recommended production strategy
- Store only **hashed refresh tokens** (not raw refresh tokens) to reduce blast radius.
- Allow multiple sessions per user by storing a refresh token per device/session.

Minimal change approach (fastest):
- Keep current schema.
- Store refresh token as-is.
- Revoke all tokens for a user on logout.

Better approach (next iteration):
- Add fields like `session_id`, `device_id`, `refresh_token_hash`.

---

## 7) Environment variables

In `mob-api/.env`:
```env
JWT_SECRET=...long-random...
JWT_REFRESH_SECRET=...long-random...
```

Expiry is already configured via `app.config.ts`.

---

## 8) Implementation plan (what we'll do next)

### Phase 1 (make it work end-to-end)
- Add `POST /auth/refresh` endpoint.
- Add `POST /auth/logout` endpoint.
- Replace the placeholder `JwtAuthGuard` with real verification + `req.user`.
- Update mob-ui `baseApi` to auto-refresh + retry on `401`.

### Phase 2 (harden)
- Token rotation + hashed refresh tokens.
- Multi-session support (per device).
- Add rate limits on auth endpoints.

---

## 9) Checklist

- [ ] Access token validated on every protected endpoint
- [ ] Refresh endpoint works
- [ ] Client retries failed requests after refresh
- [ ] Logout revokes tokens and clears client storage
