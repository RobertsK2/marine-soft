# Phase 8 — Audit Log

## Objective
Create reliable history for meaningful operational changes.

## Audit Events
Booking create/edit/status, berth assignment/reassignment, check-in/out, berth status change, extension, move, cancellation, payment/balance changes, guest ETA/ETD updates.

## Event Data
Store event type, marina, actor, entity type/ID, change summary or before/after, timestamp, and optional metadata.

## Visibility
Admin sees full marina audit history. Staff sees history relevant to the booking/berth being viewed.

Audit records should be append-only through normal product workflows.

## Tests
Event creation, actor attribution, booking history, berth history, tenant isolation, non-destructive updates.

## Done When
Important operational actions can be traced reliably.
