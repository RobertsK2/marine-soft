# Phase 4 — Pricing Engine

## Objective

Calculate a real booking price before payment.

## V1 Pricing Models

Support marina-configurable pricing using one of:

- fixed price by vessel length interval
- price per meter

Support seasonal pricing where each booked night uses the season active on that night.

## Taxes

Marina configures tax/VAT behavior.

Customer sees final tax-inclusive total with a clear breakdown.

## Mandatory Fees

Support simple mandatory fees:

- per booking
- per night
- per vessel
- percentage

Do not add optional extras yet unless already required.

## Snapshot

The final calculated booking price must be snapshotted so future pricing-table changes do not mutate existing bookings.

## Rules

Pricing must be authoritative on the server.

Never trust totals calculated only in the browser.

## Out of Scope

- promo codes
- refunds
- subscription pricing
- electricity/water extras
- dynamic pricing

## Done When

A valid availability request can produce a stable server-calculated final price and breakdown.
