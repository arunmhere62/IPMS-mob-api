
---

## ✅ Terms & Conditions (Legal Documents) System

This backend supports a centralized **Legal Documents** system used for Terms & Conditions / Privacy Policy acceptance across clients.

### Roles & Responsibility

- **Web app (Product owner / backoffice)**
  - Authors and publishes legal documents (new version, active/inactive, required, effective date, optional org scope)
- **Mobile app (PG owners / consumers)**
  - Fetches required documents and blocks critical flows until acceptance is recorded

### Data Model (Prisma)

- **`legal_documents`**
  - Canonical registry of legal docs
  - Versioned by `(type, version)`
  - Can be global (`organization_id = null`) or org-scoped
  - Can be required (`is_required = true`) and active (`is_active = true`)

- **`user_legal_acceptance`**
  - Acceptance audit trail per user and doc
  - Unique by `(user_id, legal_document_id)`
  - Supports revocation (`is_active=false`, `revoked_at`, `revoked_reason`)
  - Captures `acceptance_context` (e.g. `SIGNUP`, `LOGIN`, `INVOICE_GENERATION`, `PAYMENT_PROCESSING`)

### API Endpoints (module: `src/modules/legal-documents`)

Base route: `GET/POST/PATCH /api/v1/legal-documents`

- **Create legal document (backoffice/admin)**
  - `POST /legal-documents`
  - Requires header: `x-user-id`
  - Optional header/body: `x-organization-id` / `organization_id`

- **List documents**
  - `GET /legal-documents`
  - Query supports: `type`, `is_active`, `required_only`, `organization_id`, pagination

- **Fetch one**
  - `GET /legal-documents/:id`

- **Update**
  - `PATCH /legal-documents/:id`
  - Requires header: `x-user-id`

- **Activate/Deactivate**
  - `PATCH /legal-documents/:id/active?value=true|false`
  - Requires header: `x-user-id`

- **Accept a document (consumer)**
  - `POST /legal-documents/:id/accept`
  - Requires header: `x-user-id`
  - Optional header: `x-organization-id`
  - Body: `{ acceptance_context, ip_address?, user_agent? }`

- **Revoke acceptance (consumer)**
  - `POST /legal-documents/:id/revoke`
  - Requires header: `x-user-id`
  - Body: `{ reason? }`

- **Check acceptance status for required docs (consumer)**
  - `GET /legal-documents/required/status?context=SIGNUP|LOGIN|...`
  - Requires header: `x-user-id`
  - Optional header: `x-organization-id`
  - Returns: `{ required, accepted, pending, is_all_accepted }`

### Recommended Client Enforcement Flow

- **Signup (mobile PG owner)**
  - Call `GET /legal-documents/required/status?context=SIGNUP`
  - If `pending.length > 0`, show an acceptance UI and call `POST /legal-documents/:id/accept` for each required doc
  - Only then proceed to OTP / signup completion

- **Login (mobile PG owner)**
  - After auth, call `GET /legal-documents/required/status?context=LOGIN`
  - If not all accepted, force a blocking modal before letting user reach the app

- **Invoice/Payment flows (later phases)**
  - Same pattern using a different `context` string (for auditability)

