# Phase 5 — Blocked Berth Impact

## Objective
Handle assigned berths becoming blocked or out of service.

## Trigger
When berth becomes `blocked` or `out_of_service`, find affected current/upcoming assignments.

## Behavior
- Flag affected bookings.
- Show operational conflict.
- Suggest suitable alternatives where possible.
- Do not auto-reassign.
- Do not auto-notify customer before staff confirms resolution.

## Resolution
Staff can assign an alternative, leave unresolved with warning, or cancel if necessary.

## Tests
Blocked unassigned berth, blocked assigned berth, alternative available/unavailable, multiple affected bookings, tenant isolation.

## Done When
A berth outage cannot silently leave bookings in an impossible state.
