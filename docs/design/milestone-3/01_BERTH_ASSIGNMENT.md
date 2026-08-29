# Phase 1 — Berth Assignment

## Objective
Allow staff to assign a real physical berth to an existing booking closer to arrival.

## Rules
- Manual assignment only.
- Do not auto-assign without staff confirmation.
- Berth must fit vessel length, beam, and draft.
- Berth must be operational and conflict-free.
- Booking remains capacity-based until assignment.
- One active assignment for the normal stay.
- Reassignment must preserve history.

## UI
Booking detail should show assignment status, suitable berths, warnings, assigned berth code, and reassignment action.

Marina map may show reserved/occupied only when real assignment exists.

## Tests
Valid assignment, incompatible berth, blocked/out-of-service berth, conflict rejection, reassignment, tenant isolation.

## Done When
Staff can safely assign and reassign a real berth to a booking.
