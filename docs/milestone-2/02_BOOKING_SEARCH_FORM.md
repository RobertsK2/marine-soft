# Phase 2 — Booking Search Form

## Objective

Collect the minimum customer inputs required to request availability.

## Inputs

- arrival date
- departure date
- ETA
- ETD
- vessel length
- vessel beam
- vessel draft

Optional:
- vessel name

## Rules

- departure must follow arrival
- vessel dimensions must be positive
- use marina timezone
- use `[arrival, departure)` stay semantics
- preserve entered form state when navigating between booking steps
- do not create a booking yet

## UX

Keep the flow simple and mobile-friendly.

Primary action:

`Check availability`

## Out of Scope

- payment
- customer account
- promo code
- pricing logic
- hold creation

## Done When

The public form validates correctly and can submit a clean server request for availability.
