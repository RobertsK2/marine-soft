# Phase 5 — Availability and Matching

## Objective

Build the first correct version of Berthio's core business logic:

> Can this vessel be safely accommodated during this stay without overbooking the marina?

This is more important than the dashboard.

## Important Model

Do not solve availability using only independent category counters.

A large berth may be suitable for several vessel sizes. Independent counters could sell the same physical capacity twice.

Berthio must evaluate actual physical berth compatibility.

## Milestone 1 Matching Rule

For a requested booking:

1. Load operational berths for the marina.
2. Filter berths that physically fit the vessel.
3. Consider existing confirmed bookings for overlapping dates.
4. Determine whether all overlapping bookings plus the new booking can be assigned to distinct suitable berths.
5. If a valid assignment exists, capacity is available.
6. Otherwise reject the booking.

The booking itself still does not need to permanently reserve a specific berth.

## Initial Reservation Rule

For the initial booking, the vessel must be able to remain in one suitable berth for the full stay.

Do not plan a mid-stay move during normal initial booking.

## Matching Inputs

Milestone 1 uses only:
- vessel length
- vessel beam
- vessel draft
- berth operational status
- `allow_smaller_vessels`

Do not include electricity, weight, boat type, premium preferences, etc. until required by a real pilot.

## Existing Booking Conflicts

Use `[arrival, departure)` semantics.

Example:
- Booking A: Aug 10 → Aug 12
- Booking B: Aug 12 → Aug 14

These do not conflict by night.

## Deterministic Algorithm

Do not use AI.

Use deterministic matching. Prefer the smallest suitable berth / marina-defined priority behavior where useful so scarce large berths are not unnecessarily consumed.

Correctness is more important than cleverness.

## Domain Boundary

Implement matching as pure or mostly pure domain logic, conceptually:

`checkAvailability(request, berths, existingBookings)`

UI calls server logic, which calls this domain logic.

## Required Tests

1. Vessel fits exactly one berth → available.
2. Vessel fits zero berths → unavailable.
3. Two bookings compete for one berth → reject second.
4. Small vessel fits several berths → succeeds.
5. Large vessel needs large berth while small vessel fits both → algorithm should preserve scarce large berth where possible.
6. Back-to-back stays → allowed.
7. `out_of_service` berth → excluded.
8. `blocked` berth → excluded.
9. Marina A bookings do not affect Marina B.
10. Mixed vessel sizes produce correct result.

## Concurrency

Manual admin bookings have lower concurrency than public booking, but availability check and confirmed booking creation should still move toward a transaction-safe server path.

Do not depend on a client-side check as the final guarantee.

Full checkout holds come later with public booking.

## Done When

- Manual booking calls availability domain before confirmation.
- Impossible bookings are rejected.
- Possible bookings are accepted.
- Tests cover constrained berth scenarios.
- Algorithm does not rely on pricing category counters.
- Matching code is separate from React UI.
