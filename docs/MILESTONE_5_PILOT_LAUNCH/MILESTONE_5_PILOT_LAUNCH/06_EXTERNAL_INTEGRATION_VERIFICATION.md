# M5.6 — External Integration Verification

## Goal

Prove that configured external services actually work end-to-end in the deployed environment.

An environment variable being present is not evidence of a functioning integration.

## A — Stripe Connect

### Verify configuration

Confirm:

- test keys are used in staging;
- live keys are used only in production;
- local platform fallback is false outside local development;
- the marina has the intended Connect account association;
- webhook endpoint points to the correct environment;
- webhook signing secret belongs to that endpoint/environment.

### Exercise real test flow

1. Create/check availability through the public page.
2. Choose online payment.
3. Create the server-side hold.
4. Create Stripe Checkout session.
5. Complete Stripe test payment.
6. Receive the signed webhook.
7. Confirm booking/payment state transitions correctly.
8. Confirm duplicate webhook delivery is idempotent.
9. Confirm the booking appears correctly in admin Payments/Booking Detail.

Use the repository verification helpers where appropriate:

```bash
npm run stripe:verify
npm run stripe:verify-checkout
```

### Pay-at-marina negative assertion

For an on-site booking:

- no Stripe Checkout session should be created;
- no fake zero-value Stripe payment should be created;
- booking remains operationally valid;
- balance remains due at marina;
- admin UI shows the outstanding state clearly.

## B — Postmark

### Configuration

Verify:

- correct staging/production server token;
- verified sender;
- correct transactional message stream;
- from-address matches approved configuration.

### Exercise

Create a non-customer pilot/test booking that should trigger a transactional email.

Verify:

1. notification enters the outbox;
2. worker processes the item;
3. Postmark accepts the message;
4. provider message ID/status is recorded where existing logic supports it;
5. recipient receives the message;
6. retry behavior does not duplicate delivery unexpectedly.

## C — Notification worker and scheduler

### Required behavior

An external scheduler must call the protected notification processing endpoint with the correct bearer secret.

Verify:

- secret exists only server-side;
- unauthorized call is rejected;
- authorized call succeeds;
- scheduler logs show successful invocation;
- Berthio integration/readiness status reflects real verified state rather than configuration guesswork;
- `NOTIFICATION_WORKER_SCHEDULED=true` is set only after real readback.

## D — Sentry

In staging:

1. intentionally trigger one controlled, non-sensitive exception;
2. confirm it reaches the staging Sentry project;
3. confirm environment/release tagging is correct where configured;
4. inspect payload for accidental guest/admin PII;
5. ensure source maps/errors are useful enough to diagnose production failures.

Do not create a permanent “throw error” public endpoint solely for testing unless it is protected/removed afterward.

## E — PostHog, if enabled

Analytics is optional for the pilot. If enabled:

- verify the approved regional host/project;
- trigger one existing typed event;
- inspect properties for accidental personal/sensitive data;
- confirm analytics failure cannot block booking/payment.

If analytics is disabled, record `NOT ENABLED FOR PILOT`; do not treat absence as a product failure.

## F — Supabase production-like verification

Run/inspect:

- migration state;
- RLS behavior;
- security advisor;
- performance advisor;
- database logs for obvious repeated failures during E2E;
- connection behavior under concurrent booking tests if staging resources permit.

## Exit criteria

- [ ] Stripe staging checkout succeeds end-to-end;
- [ ] signed webhook is received and applied;
- [ ] duplicate webhook handling is safe;
- [ ] pay-at-marina bypasses Stripe correctly;
- [ ] Postmark sender/stream is verified;
- [ ] transactional test email is actually delivered;
- [ ] notification worker rejects unauthorized requests;
- [ ] scheduler successfully invokes the worker;
- [ ] Sentry receives a controlled staging exception;
- [ ] no unintended PII/secrets observed in provider payload/logs;
- [ ] Supabase advisors are reviewed;
- [ ] every provider is clearly identified as staging vs production.

## Evidence

Keep provider readback evidence without secrets:

- timestamp;
- environment;
- provider;
- test booking/reference ID safe for internal records;
- result;
- screenshot/log reference if appropriate;
- verifier/owner.
