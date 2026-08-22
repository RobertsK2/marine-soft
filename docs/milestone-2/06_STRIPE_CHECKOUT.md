# Phase 6 — Stripe Checkout

## Objective

Connect a valid booking hold to Stripe test checkout.

## Architecture

Use Stripe with Stripe Connect Standard.

Use direct charges to the marina connected account so Berthio does not hold customer funds.

## Payment Methods

Support:

- cards
- Apple Pay where Stripe enables it
- Google Pay where Stripe enables it

## Rules

- checkout must reference the hold
- amount must come from server-side pricing snapshot
- do not trust browser amount
- use idempotency
- use webhook confirmation as authoritative payment result
- Stripe success redirect alone must not confirm payment

## Failure Handling

Handle:

- checkout creation failure
- abandoned checkout
- webhook retry
- duplicate webhook delivery
- successful payment with delayed browser return

## Out of Scope

- deposits beyond simple future-ready structure
- automatic balance collection
- refunds
- disputes UI
- Stripe Billing subscriptions

## Done When

A test customer can pay successfully through Stripe and the payment can be reliably reconciled to the correct hold.
