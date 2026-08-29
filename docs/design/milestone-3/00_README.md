# Berthio — Milestone 3: Operational Booking Management

## Goal
Turn Berthio from a booking system into a usable marina operations tool.

Flow: booking → berth assignment → arrival → check-in → stay changes → berth issues → departure → audit trail.

## Build Order
1. `01_BERTH_ASSIGNMENT.md`
2. `02_CHECK_IN_OUT.md`
3. `03_BOOKING_CHANGES.md`
4. `04_EXTENSIONS_AND_MOVES.md`
5. `05_BLOCKED_BERTH_IMPACT.md`
6. `06_CANCELLATION_FLOW.md`
7. `07_PAYMENT_BALANCE.md`
8. `08_AUDIT_LOG.md`
9. `09_NOTIFICATIONS.md`
10. `10_MILESTONE_VERIFICATION.md`

Implement one file at a time and preserve Milestones 1–2.

## Core Principles
- Assign a physical berth closer to arrival, not during initial booking.
- Assignment must respect vessel suitability and operational berth state.
- Marina staff confirm operational exceptions.
- Reuse existing availability, pricing, payment, booking, and hold logic.
- Meaningful operational changes must be auditable.
- Tenant isolation and RLS remain mandatory.

## Out of Scope
Marketplace, native app, seasonal contracts, geometry editor, AI optimization, advanced CRM/accounting, automatic refunds, custom domains.

## Milestone Done When
Marina staff can assign a berth, check in/out, edit bookings safely, extend stays, handle berth outages, cancel bookings, track balances, inspect audit history, and send essential operational notifications.
