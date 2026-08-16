# Product Support Ticketing Flow (PG Owner ↔ Product Team)

## Goal
Provide a ticketing system where:

- PG owners/staff raise support tickets from the **mobile app**
- Product team views/triages/updates tickets from the **web UI**
- All data is stored and served by the **mob-api**

This document describes the flow, responsibilities, endpoints, and key files.

---

## Actors
- **PG Owner / Staff (Reporter)**: uses `mobile/mob-ui`
- **Product Team (Support Agent)**: uses `web/web-ui`
- **Backend**: `mobile/mob-api` (NestJS + Prisma)

---

## Ticket lifecycle (MVP)
- **OPEN**: ticket created by PG owner
- **IN_PROGRESS**: product team started working
- **RESOLVED**: fix/workaround provided
- **CLOSED**: confirmed closed

(You can add `WAITING_FOR_USER` later if needed.)

---

## End-to-end flow

### 1) PG owner creates a ticket (Mobile)
- Screen: `Support Tickets` → `Report Issue`
- Data captured:
  - title
  - description
  - category: `BUG | FEATURE_REQUEST | SUPPORT | OTHER`
  - priority: `LOW | MEDIUM | HIGH | CRITICAL`
  - optional attachments (image URLs)
  - optional `pg_id` (selected PG)

### 2) Product team views tickets (Web)
- Inbox view: list, search, filter
- Opens ticket detail:
  - sees description + metadata + comments thread

### 3) Product team updates status + adds comments (Web)
- Update status/resolution
- Post a comment (request info, share fix, etc.)

### 4) PG owner replies (Mobile)
- Open ticket details
- Post comment + attachments

---

## Backend API (mob-api)
Base path: `/tickets`

- `POST /tickets` create
- `GET /tickets` list with filters:
  - `page`, `limit`, `status`, `category`, `priority`, `my_tickets`, `search`
- `GET /tickets/:id` detail (includes comments)
- `PATCH /tickets/:id` update (status, resolution, assigned_to, etc.)
- `DELETE /tickets/:id` soft delete
- `POST /tickets/:id/comments` add comment
- `GET /tickets/stats` basic stats

Key backend files:
- `mobile/mob-api/src/modules/ticket/ticket.controller.ts`
- `mobile/mob-api/src/modules/ticket/ticket.service.ts`
- `mobile/mob-api/src/modules/ticket/dto/*`

---

## Mobile implementation (mob-ui)
Key screens:
- `mobile/mob-ui/src/screens/tickets/TicketsScreen.tsx`
- `mobile/mob-ui/src/screens/tickets/CreateTicketScreen.tsx`
- `mobile/mob-ui/src/screens/tickets/TicketDetailsScreen.tsx`

Mobile API client:
- `mobile/mob-ui/src/services/api/ticketsApi.ts`

Navigation:
- `mobile/mob-ui/src/navigation/AppNavigator.tsx`

---

## Web implementation (web-ui)
Key screens:
- `web/web-ui/src/screens/tickets/tickets-screen.tsx`
- `web/web-ui/src/screens/tickets/ticket-details-screen.tsx`

Web API client:
- `web/web-ui/src/store/tickets.api.ts`

Routing:
- `web/web-ui/src/app-routes.tsx`

Sidebar link:
- `web/web-ui/src/components/layout/data/sidebar-data.ts`

---

## Notes / next improvements
- Add `WAITING_FOR_USER` status
- Add assignment UI (dropdown of agents)
- Add attachment previews in web ticket detail
- Add notifications (push/web) when:
  - ticket created
  - agent replied
  - status changed
- Add SLA fields (first_response_at, resolved_at) for metrics

---

## Future phase: Tenant → PG Owner ticketing
This should be a separate lane (separate queue), so product-team support tickets do not mix with tenant operational tickets.
