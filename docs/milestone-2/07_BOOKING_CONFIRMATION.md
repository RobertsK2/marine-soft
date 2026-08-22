# Phase 7 — Booking Confirmation

## Objective

Convert a successfully paid hold into a confirmed booking exactly once.

## Rules

- Stripe webhook is authoritative
- booking confirmation must be idempotent
- duplicate webhooks must not create duplicate bookings
- paid-but-no-booking must be detectable and treated as critical
- hold becomes consumed/closed
- booking stores customer snapshot
- booking stores vessel snapshot
- booking stores pricing snapshot
- booking source becomes `online`

## Confirmation Page

Show:

- booking reference
- marina
- stay dates
- vessel
- paid total
- booking status
- next-step guidance

Do not promise a specific berth unless one has actually been assigned.

## Admin Integration

The confirmed online booking must appear in existing marina admin booking views and affect availability.

## Done When

One successful Stripe payment creates exactly one confirmed booking visible in admin.
