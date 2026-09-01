# Phase 3 — Booking Changes

## Objective
Allow safe edits to existing bookings without corrupting availability or financial history.

## Editable Fields
Arrival, departure, ETA, ETD, vessel dimensions/name, and operational customer contact details.

## Revalidation
Changes affecting dates or vessel dimensions must rerun availability, berth suitability, and current assignment validation.

## Pricing
If price changes, calculate server-side and preserve previous financial snapshot/history.
- Increase → amount due.
- Decrease → refundable difference calculated, not auto-refunded.

## Tests
ETA/ETD change, date extension/reduction, vessel size increase, invalidated assignment, price increase/decrease, tenant isolation.

## Done When
Staff can safely edit bookings with operational revalidation.
