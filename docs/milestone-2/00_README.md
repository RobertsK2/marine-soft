# Berthio — Milestone 2: Public Booking Flow

## Goal

Build the first end-to-end customer booking flow:

> Marina website → Berthio hosted marina page → dates + vessel → availability → price → hold → Stripe checkout → confirmation → booking visible in marina admin.

Milestone 2 should reuse the stable Milestone 1 admin core rather than duplicate it.

## Build Order

1. `01_PUBLIC_MARINA_PAGE.md`
2. `02_BOOKING_SEARCH_FORM.md`
3. `03_PUBLIC_AVAILABILITY.md`
4. `04_PRICING_ENGINE.md`
5. `05_BOOKING_HOLD.md`
6. `06_STRIPE_CHECKOUT.md`
7. `07_BOOKING_CONFIRMATION.md`
8. `08_GUEST_ACCESS.md`
9. `09_MILESTONE_VERIFICATION.md`

Implement one file at a time.

## V1 Distribution

Berthio is not a marketplace yet.

The marina sends traffic from its own website to:

`berthio.com/marina/[slug]`

## Core Rules

- Reuse Milestone 1 berth inventory and availability engine.
- No permanent berth assignment at booking time.
- Guest booking is allowed.
- Stripe only for Milestone 2.
- Use Stripe Connect Standard architecture.
- Money should go directly to the marina connected account.
- Use a 15-minute capacity hold before checkout.
- Booking writes remain server-authoritative.
- Do not trust client-side availability or pricing.
- Persist booking/customer/vessel/price snapshots.
- Preserve tenant isolation and RLS.

## Out of Scope

- marketplace search
- native app
- SMS
- promo codes
- automatic refunds
- complex deposit schedules
- custom domains
- customer account requirement
- berth auto-assignment
- seasonal contracts
- marina geometry editor

## Milestone Done When

A guest can:

1. open a public marina page
2. select dates
3. enter vessel dimensions
4. receive real availability
5. see a real calculated price
6. reserve capacity with a temporary hold
7. complete Stripe test checkout
8. receive confirmation
9. see the booking in the marina admin
10. manage the booking through a secure guest link

and all critical payment/hold/idempotency tests pass.
