# Phase 4 — Bookings Core

## Objective

Allow marina staff to create and manage manual transit bookings before the public customer flow exists.

A manual booking simulates a booking coming from phone, email, walk-in, or an existing system.

## Booking Principle

The customer does not permanently reserve a specific berth at booking creation.

The booking represents guaranteed suitable marina capacity. Physical berth assignment happens later.

## Entity: `bookings`

### Identity
- internal UUID
- human-readable booking reference
- `marina_id`

### Stay
- arrival date
- departure date
- ETA
- ETD

Interval semantics: `[arrival, departure)`.

Example: Aug 10 → Aug 12 = nights of Aug 10 and Aug 11.

### Customer Snapshot
- customer name
- email
- phone

Do not make booking history depend on a mutable customer profile.

### Vessel Snapshot
- vessel name if supplied
- length
- beam
- draft

Changing a saved vessel later must not silently mutate an existing booking.

### Status
Keep initial status model small:
- `confirmed`
- `cancelled`
- `checked_in`
- `checked_out`

### Source
- `manual`
- future: `online`
- future: `walk_in`

## Manual Booking Form

Admin/Staff can create a booking with:
- customer contacts
- vessel dimensions
- arrival/departure
- ETA/ETD

Do not make pricing/payment mandatory in Milestone 1.

## Validation

Before storing a confirmed booking:
- dates valid
- departure after arrival
- vessel dimensions positive
- marina has enough physically suitable capacity

Availability logic belongs in Phase 5. Do not duplicate it inside the form.

## Booking Detail

Show:
- booking reference
- customer
- vessel
- dates
- ETA/ETD
- booking status
- source

Payments, documents, communication, and berth assignment come later.

## RLS

Bookings belong to a marina. Tenant isolation must be enforced in the database.

## Done When

- Marina user can create manual booking.
- Booking receives UUID and human reference.
- Vessel/customer snapshot is stored.
- Dates follow `[arrival, departure)`.
- Booking appears in list.
- Booking detail works.
- Cross-tenant access is blocked.
- Availability validation can be called from domain layer.
