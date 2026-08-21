# Milestone 1 — Verification Checklist

Do not move to the public booking page until this checklist passes.

## A. Authentication

- [ ] Marina Admin can log in.
- [ ] Marina Staff can log in.
- [ ] Unauthenticated user cannot open protected dashboard routes.
- [ ] Marina A cannot access Marina B through UI.
- [ ] Marina A cannot access Marina B by manipulating IDs/API requests.
- [ ] RLS blocks cross-tenant reads.
- [ ] RLS blocks cross-tenant writes.

## B. Marina and Tenant Model

- [ ] Organization exists.
- [ ] Marina belongs to organization.
- [ ] Organization membership maps user to role.
- [ ] Architecture can support multiple marinas per organization later.
- [ ] Marina timezone is stored as IANA timezone.

## C. Berths

- [ ] At least 10 test berths exist.
- [ ] Different berth sizes exist.
- [ ] Berths store max length.
- [ ] Berths store max beam.
- [ ] Berths store supported draft.
- [ ] Berths store status.
- [ ] Berths store priority.
- [ ] Berths can be blocked.
- [ ] Berths can be marked out of service.
- [ ] Larger-berth-for-smaller-vessel permission is represented.

## D. Manual Bookings

- [ ] Staff/Admin can create manual booking.
- [ ] Booking has internal UUID.
- [ ] Booking has human-readable reference.
- [ ] Customer snapshot is stored.
- [ ] Vessel snapshot is stored.
- [ ] Arrival/departure are stored.
- [ ] ETA/ETD are stored.
- [ ] `[arrival, departure)` semantics are consistent.
- [ ] Booking appears in booking list.
- [ ] Booking detail page works.

## E. Availability

- [ ] Vessel too large for all berths is rejected.
- [ ] Vessel with suitable capacity is accepted.
- [ ] Overbooking is rejected.
- [ ] Back-to-back stays work.
- [ ] Blocked berths are excluded.
- [ ] Out-of-service berths are excluded.
- [ ] Matching protects scarce large berths where possible.
- [ ] Matching uses physical compatibility rather than category counters only.
- [ ] Availability logic is outside React UI.
- [ ] Automated tests cover important matching cases.

## F. Marina Map

- [ ] SVG marina map renders.
- [ ] Every visible berth maps to stable `berth_id`.
- [ ] Map state comes from database.
- [ ] Clicking berth opens correct details.
- [ ] Status updates persist.
- [ ] No custom geometry editor was built.

## G. Overview

- [ ] Arrivals Today uses real data.
- [ ] Departures Today uses real data.
- [ ] Occupancy uses documented real calculation.
- [ ] Marina map uses real data.
- [ ] Today's Activity uses real events/data.
- [ ] Empty states work.
- [ ] Marina-local timezone is respected.
- [ ] Fake revenue is not shown as real revenue.

## H. Quality

- [ ] TypeScript passes.
- [ ] ESLint passes.
- [ ] Production build passes.
- [ ] Critical matching tests pass.
- [ ] RLS isolation tests pass.
- [ ] No secrets are committed.
- [ ] No `any` was added just to silence typing problems.
- [ ] No unnecessary framework/backend was added.

## Final Demo Scenario

1. Log in as Marina Admin.
2. Open pilot marina.
3. Confirm at least 10 berths are visible.
4. Mark one berth `out_of_service`.
5. Create manual booking for a vessel.
6. Confirm Berthio checks physical suitability.
7. Confirm booking succeeds only when capacity exists.
8. Confirm booking appears in admin operations.
9. Confirm Overview updates.
10. Confirm marina SVG reflects current berth state.
11. Log in as user from Marina B.
12. Confirm Marina B cannot see Marina A data.

## Pass Condition

If all critical items pass:

> **Milestone 1 — Admin Core is complete.**

Next milestone:

> **Public Marina Booking Flow**

That phase adds:

`Marina website → Berthio hosted booking page → vessel/date selection → availability → price → payment`

Do not start Stripe or public booking before Admin Core is stable enough to trust its availability data.
