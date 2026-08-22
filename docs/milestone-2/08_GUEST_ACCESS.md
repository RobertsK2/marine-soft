# Phase 8 — Guest Booking Access

## Objective

Allow a guest customer to safely reopen and manage their booking without requiring an account.

## Access Model

Use a long, random, signed, expiring token.

Do not use predictable booking IDs as authorization.

## Guest Page

Allow safe viewing of:

- booking reference
- marina
- stay
- vessel snapshot
- payment summary
- status

Allow only low-risk edits initially, such as ETA/ETD, if supported by current business rules.

Sensitive changes may require email re-verification.

## Security

- token must expire
- token must be revocable/rotatable if needed
- do not expose other bookings
- do not expose admin data

## Out of Scope

- mandatory customer accounts
- full self-service cancellation/refunds
- magic-link account conversion
- multi-vessel customer profile

## Done When

A guest can securely reopen their own booking from a dedicated management link.
