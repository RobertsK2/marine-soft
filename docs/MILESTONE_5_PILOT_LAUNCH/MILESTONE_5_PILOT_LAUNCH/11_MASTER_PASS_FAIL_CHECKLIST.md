# M5.11 — Master Pilot PASS/FAIL Checklist

## How to use

This is the final Milestone 5 gate. Do not mark an item PASS because “the code exists.” Mark PASS only when the required behavior/evidence has been verified in the relevant environment.

Use:

- `PASS` — verified;
- `FAIL` — verified broken/missing;
- `N/A` — genuinely not applicable to the pilot, with reason;
- `EXCEPTION` — intentionally accepted risk, with owner/mitigation/review date.

## A — Dependency security

- [ ] Current `npm audit` reviewed.
- [ ] Applicable critical/high runtime vulnerabilities resolved or formally accepted.
- [ ] Next.js security patch level reviewed and updated appropriately.
- [ ] `npm ci` is reproducible.
- [ ] Secrets verification passes.

## B — Deterministic verification

- [ ] Unit suite passes.
- [ ] DB suite passes from clean environment.
- [ ] DB suite is repeatable or explicitly isolated/reset by the test harness.
- [ ] `npm run verify` passes.
- [ ] Hold concurrency test passes.
- [ ] Assignment concurrency test passes.
- [ ] Playwright E2E passes.
- [ ] Production build passes.
- [ ] Remote CI is green for the exact release SHA.

## C — Public/legal correctness

- [ ] Berthio Terms page contains approved non-placeholder content.
- [ ] Berthio Privacy page contains approved non-placeholder content.
- [ ] Stale DockPay public branding removed.
- [ ] Public booking does not say capacity is reserved before it is actually secured.
- [ ] Payment/trust copy reflects enabled methods.
- [ ] Online-only flow passes.
- [ ] Pay-at-marina-only flow passes.
- [ ] Both-methods flow passes.
- [ ] Desktop successful availability auto-scroll passes.
- [ ] Mobile booking step flow passes.

## D — Security hardening

- [ ] Security headers verified on deployed app.
- [ ] CSP/related policy does not break required providers.
- [ ] Admin MFA policy implemented or controlled exception recorded.
- [ ] Public availability endpoint abuse protection verified.
- [ ] Existing anonymous hold protection verified.
- [ ] Admin/staff authorization boundaries verified.
- [ ] Cross-tenant isolation verified.
- [ ] Guest access isolation verified.
- [ ] Supabase security advisor reviewed.
- [ ] No unresolved critical/high security finding.

## E — Staging environment

- [ ] Dedicated staging Supabase exists.
- [ ] Staging deployment exists on HTTPS.
- [ ] Migrations apply cleanly.
- [ ] Staging auth redirects work.
- [ ] Staging uses non-production credentials.
- [ ] Stripe local fallback disabled.
- [ ] Realistic marina dataset loaded.
- [ ] Admin cloud smoke test passes.
- [ ] Public booking cloud smoke test passes.

## F — Stripe

- [ ] Staging/test Stripe mode verified.
- [ ] Correct Connect marina account verified.
- [ ] Checkout creation verified.
- [ ] Test payment completes.
- [ ] Signed webhook reaches correct environment.
- [ ] Webhook updates booking/payment correctly.
- [ ] Duplicate webhook delivery is safe.
- [ ] Pay-at-marina booking creates no Stripe Checkout.
- [ ] Pay-at-marina balance remains due.

## G — Notifications/Postmark

- [ ] Sender verified.
- [ ] Message stream/config verified.
- [ ] Test booking creates expected notification/outbox item.
- [ ] Worker successfully processes it.
- [ ] Postmark accepts/delivers test message.
- [ ] Unauthorized worker invocation rejected.
- [ ] Scheduler invokes worker successfully.
- [ ] Scheduled-worker readiness flag/status reflects real verification.

## H — Observability

- [ ] Controlled staging exception reaches Sentry.
- [ ] Correct environment/release identified.
- [ ] No unintended PII/secrets observed.
- [ ] PostHog verified if enabled, otherwise documented N/A.

## I — Backup/restore

- [ ] Backup owner/policy documented.
- [ ] Backup created.
- [ ] Restored to isolated verification environment.
- [ ] Critical schema/data checks pass.
- [ ] Representative booking/payment/audit/notification history verified.
- [ ] Tenant isolation works against restored data.
- [ ] Restore environment cannot send customer notifications/payments.
- [ ] Restore evidence recorded.
- [ ] Verification restore destroyed afterward.

## J — Pilot marina onboarding

- [ ] Marina profile/timezone correct.
- [ ] Admin/staff accounts correct.
- [ ] Berth inventory imported and customer-verified.
- [ ] SVG map IDs match real berth inventory.
- [ ] Marina approves map orientation/labels.
- [ ] Pricing manually spot-checked.
- [ ] VAT/fees/seasons configured.
- [ ] Cancellation policy configured.
- [ ] Payment methods configured intentionally.
- [ ] Public page publish state intentional.
- [ ] Staff acceptance drill completed.

## K — Full booking lifecycle

- [ ] Public availability succeeds for valid vessel/date case.
- [ ] Unavailable case produces correct message.
- [ ] Online booking succeeds.
- [ ] Pay-at-marina booking succeeds if enabled.
- [ ] Booking visible in admin.
- [ ] Berth assignment succeeds.
- [ ] Check-in succeeds.
- [ ] Supported booking modification/extension succeeds.
- [ ] Move/reassignment succeeds.
- [ ] Block/out-of-service handling works.
- [ ] Cancellation path works.
- [ ] Payment balance is correct.
- [ ] Audit history is correct.
- [ ] Notification history is correct.
- [ ] Check-out succeeds.

## L — Release control

- [ ] Exact release commit SHA recorded.
- [ ] `git diff --check` clean.
- [ ] No required uncommitted code.
- [ ] All required CI checks green on exact SHA.
- [ ] External provider readbacks correspond to intended environment.
- [ ] Backup evidence available.
- [ ] Known exceptions documented.
- [ ] Rollback/mitigation owner identified.
- [ ] First-week monitoring owner identified.

## Final decision

### PASS

Use only when all hard blockers are PASS and any exception is explicitly accepted:

`MILESTONE 5 — CONTROLLED PILOT READY`

### FAIL

Use if any hard blocker remains:

`MILESTONE 5 — CONTROLLED PILOT NOT READY`

## Hard blockers

Do not launch the pilot while any of these remain unresolved:

- applicable critical dependency vulnerability;
- red release CI;
- failing booking/assignment concurrency protection;
- broken tenant isolation;
- broken payment/webhook correctness;
- pay-at-marina incorrectly treated as paid;
- public legal placeholder/stale brand;
- unverified required notification scheduler;
- no tested backup/restore path;
- exposed production secret;
- core public booking flow failing in the production-like environment.
