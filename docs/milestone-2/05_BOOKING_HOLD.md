# Phase 5 — Booking Hold

## Objective

Protect capacity while the customer completes payment.

## Hold Rule

Create a 15-minute booking hold when the customer continues to payment.

The hold must:

- be created server-side
- atomically re-check availability before creation
- temporarily consume capacity
- expire automatically
- be safe against duplicate requests

## Failure Rule

If Stripe checkout session creation fails, release the hold.

## Priority

An active public hold takes priority over conflicting staff edits/bookings.

If staff action conflicts, show a clear operational warning.

## Concurrency

This phase must prevent the last available capacity from being sold twice.

Use transaction-safe database logic.

## Out of Scope

- payment itself
- permanent berth assignment
- Redis
- distributed lock infrastructure unless truly necessary

## Done When

Two concurrent customers cannot both hold the same last unit of feasible physical capacity.
