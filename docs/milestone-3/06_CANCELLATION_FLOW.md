# Phase 6 — Cancellation Flow

## Objective
Create a controlled cancellation workflow.

## Flow
1. Validate booking state.
2. Apply marina cancellation policy.
3. Calculate refund recommendation.
4. Show financial impact.
5. Require staff confirmation.
6. Cancel booking.
7. Release future capacity.
8. Preserve payment/history.

Do not automatically approve/execute refunds in this phase.

## Tests
Normal cancellation, already-cancelled booking, checked-out booking, refund calculation, capacity release, audit history, tenant isolation.

## Done When
Staff can cancel safely with a clear refund recommendation.
