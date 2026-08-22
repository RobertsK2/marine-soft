# Milestone 2 — Verification

## Public Flow

- [ ] Public marina page opens by slug
- [ ] Real marina data shown
- [ ] Booking form validates dates and vessel dimensions
- [ ] Public availability reuses Milestone 1 engine
- [ ] No raw berth assignment leaked
- [ ] Server pricing produces stable total
- [ ] Price snapshot is stored
- [ ] 15-minute hold is created atomically
- [ ] Last-capacity race cannot double-hold
- [ ] Failed Stripe session releases hold
- [ ] Stripe test checkout succeeds
- [ ] Webhook is authoritative
- [ ] Duplicate webhook does not duplicate booking
- [ ] Successful payment produces one booking
- [ ] Booking appears in marina admin
- [ ] Booking affects availability
- [ ] Guest management link works
- [ ] Guest cannot access another booking

## Security

- [ ] Public routes do not bypass tenant isolation
- [ ] Browser cannot set trusted amount
- [ ] Browser cannot force a marina/tenant ID
- [ ] Stripe secret is server-only
- [ ] Guest access token is not predictable

## Failure Paths

- [ ] unavailable capacity
- [ ] expired hold
- [ ] abandoned checkout
- [ ] Stripe session creation failure
- [ ] duplicate webhook
- [ ] delayed webhook
- [ ] paid-but-no-booking detection

## Quality

- [ ] lint
- [ ] TypeScript
- [ ] production build
- [ ] unit tests
- [ ] DB/RLS tests
- [ ] booking/hold integration tests
- [ ] Stripe webhook tests
- [ ] E2E public booking flow
- [ ] mobile E2E
- [ ] git diff --check

## Pass Condition

If all critical items pass:

> **MILESTONE 2 — PUBLIC BOOKING FLOW PASS**
