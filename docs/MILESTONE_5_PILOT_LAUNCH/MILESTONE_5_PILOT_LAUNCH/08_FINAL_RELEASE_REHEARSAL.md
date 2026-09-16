# M5.8 — Final Release Rehearsal

## Goal

Run the complete pilot workflow on the exact code revision intended for production and produce a single PASS/FAIL decision.

This is not the time to add features. Any code change after the rehearsal invalidates the release evidence and requires relevant checks to be run again.

## Freeze candidate

Choose a commit SHA as the release candidate.

Record:

- commit SHA;
- branch;
- date/time;
- dependency audit status;
- staging deployment corresponding to that revision.

## Gate 1 — Repository verification

Run:

```bash
npm ci
npm run verify:secrets
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```

`npm run verify` may be used as the combined command after determinism has been fixed.

Also check:

```bash
git diff --check
git status
```

The release workspace should not depend on uncommitted local changes.

## Gate 2 — Concurrency

Run:

```bash
npm run test:hold-concurrency
npm run test:assignment-concurrency
```

Failure here is a hard stop. These tests protect against selling or assigning the same capacity concurrently.

## Gate 3 — Browser E2E

Run:

```bash
npm run test:e2e
```

The release E2E suite should include the critical pilot paths rather than merely page-render smoke tests.

## Gate 4 — Booking lifecycle drill

Using staging and a realistic marina, execute:

1. public availability search;
2. online-payment booking;
3. webhook-confirmed payment;
4. pay-at-marina booking;
5. booking visible in admin;
6. berth assignment;
7. check-in;
8. extension/change flow supported by current product;
9. move/reassignment;
10. berth block/out-of-service scenario;
11. cancellation scenario;
12. outstanding balance state;
13. audit history;
14. notification delivery;
15. check-out.

Do not invent unsupported operational steps just to make the rehearsal longer.

## Gate 5 — Authorization/security

Verify at minimum:

- unauthenticated admin route rejected/redirected;
- staff/admin role boundaries;
- marina A cannot access marina B;
- public guest token cannot access unrelated booking;
- rate limits/hold quotas behave as expected;
- security headers exist on deployed app;
- secret scan green;
- Supabase security advisor reviewed.

## Gate 6 — Providers

Confirm current environment readback for:

- Stripe;
- Stripe webhook;
- Postmark;
- notification scheduler;
- Sentry;
- PostHog if enabled;
- Supabase health/advisors.

A provider test performed weeks earlier against a different revision/environment should not be treated as conclusive release evidence.

## Gate 7 — Backup evidence

Confirm `07_BACKUP_AND_RESTORE_DRILL.md` is PASS and the evidence is still applicable to the intended production data environment.

## Gate 8 — Public/legal review

Manually open:

- public booking page desktop;
- public booking page mobile;
- Terms;
- Privacy;
- login;
- booking confirmation/guest access as applicable.

Confirm:

- no placeholder copy;
- no stale DockPay branding;
- prices/payment method copy is truthful;
- no developer/internal labels;
- no obviously broken responsive state.

## Release decision

Any of the following is an automatic FAIL:

- critical/high unresolved applicable dependency vulnerability;
- red required CI;
- failing concurrency test;
- broken tenant isolation;
- broken Stripe webhook verification;
- pay-at-marina incorrectly recorded as paid;
- notification scheduler unverified when required for pilot emails;
- no backup/restore evidence;
- public legal placeholders;
- production secrets exposed in logs/repo/client.

## Exit criteria

- [ ] exact commit recorded;
- [ ] repository verification green;
- [ ] concurrency tests green;
- [ ] Playwright green;
- [ ] lifecycle drill green;
- [ ] security checks green;
- [ ] external provider readback green;
- [ ] backup/restore evidence green;
- [ ] public/legal review green;
- [ ] remote CI green for exact commit;
- [ ] no uncommitted release-critical changes exist.

Final output for this file:

`M5.8 RELEASE REHEARSAL — PASS`

or

`M5.8 RELEASE REHEARSAL — FAIL`
