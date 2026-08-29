# Phase 2 — Check-In / Check-Out

## Objective
Support real vessel arrival and departure.

## Check-In
- Confirmed booking can become `checked_in`.
- Record actual check-in timestamp in UTC.
- A berth assignment should normally exist.
- Assigned berth becomes operationally occupied.
- Missing assignment requires explicit exception.

## Check-Out
- Checked-in booking can become `checked_out`.
- Record actual check-out timestamp.
- Berth stops being occupied.

## Map
Real assigned confirmed booking may show Reserved; checked-in booking shows Occupied.

## Tests
Normal check-in/out, invalid transition, missing assignment exception, map state, tenant isolation.

## Done When
Confirmed → checked in → checked out works and map/berth state reflects reality.
