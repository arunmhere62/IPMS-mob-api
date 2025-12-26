# Subscription Restriction Conceptual Flow

This module enforces subscription plan limits to prevent organizations from exceeding their allowed capacity.

## Core Concept

Every organization operates under a subscription plan that defines maximum limits for different resources. When users try to create new resources (PG locations, rooms, beds, tenants, or employees), the system first checks if adding that resource would exceed the organization's plan limits.

## How It Works

1. **Plan Validation**: Before any create operation, the system validates the organization's active subscription plan
2. **Usage Counting**: The system counts current usage across the entire organization
3. **Limit Enforcement**: If adding the new resource would exceed the plan limit, the operation is blocked
4. **User Feedback**: Clear error messages explain which limit was reached and suggest upgrading

## Organization-Wide Limits

All limits are enforced at the organization level, not per individual PG or room:

- **PG Locations**: Total number of PG locations an organization can operate
- **Rooms**: Total rooms across all PG locations in the organization  
- **Beds**: Total beds across all rooms and PG locations in the organization
- **Tenants**: Total active tenants across all PG locations in the organization
- **Employees**: Total active employees in the organization

## Active Subscription Requirements

An organization must have an active subscription to create resources. The system checks for:
- Subscription status must be "ACTIVE"
- Subscription end date must be in the future
- If no active subscription exists, all create operations are blocked

## Usage Counting Rules

The system counts only active, non-deleted resources:
- Soft-deleted items are excluded from counts
- Only active tenants are counted (not inactive ones)
- Only active employees are counted
- All counts span the entire organization, not individual PGs

## Error Handling

When limits are exceeded, users receive:
- Clear indication of which limit was reached
- The maximum allowed by their current plan
- Guidance to upgrade their subscription to continue

## Integration Points

Domain services (RoomService, BedService, etc.) call the restriction service before performing create operations. This ensures limits are enforced consistently across the application.

## Method Selection

Choose the appropriate validation method based on what information you have available:
- If you have the organization ID: Use organization-scoped methods
- If you only have a PG ID: Use PG convenience methods  
- If you only have a room ID: Use room convenience methods

All methods ultimately enforce the same organization-wide limits regardless of the entry point used.
