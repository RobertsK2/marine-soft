# Milestone 5 — Pilot Launch Readiness

## Purpose

Milestone 5 turns the existing Berthio product from a functionally complete local/staging candidate into a **controlled-pilot-ready production system**.

This milestone is intentionally not a feature-development milestone. The booking engine, berth inventory, pricing, tenant isolation, Stripe flow, pay-at-marina flow, admin operations, notifications architecture, and public booking flow already exist. The purpose here is to close the remaining release, security, deployment, operational, legal, and verification gaps before allowing a real marina to depend on Berthio.

The source audit assessed the project as materially functional but not yet ready to declare a safe pilot launch. The biggest remaining risks were dependency security, CI determinism, missing release checks, placeholder public legal pages, customer-facing booking copy mismatches, missing production hardening, unverified external services, and missing backup/restore evidence.

## Milestone 5 outcome

Milestone 5 is complete only when Berthio can be deployed for one controlled pilot marina and the exact production revision has objective evidence that:

- known high-severity dependency issues are resolved or explicitly accepted with documented justification;
- CI is repeatable and green;
- database tests do not depend on accidental state from previous runs;
- E2E and concurrency protections are part of the release gate;
- public legal and booking copy is correct;
- security headers, admin authentication policy, and public endpoint abuse protection are addressed;
- staging and production environments are intentionally separated;
- Stripe, Postmark, the notification scheduler, Sentry, and Supabase are verified in the target environment;
- backup and restore has been exercised;
- the final release rehearsal passes on the exact release commit;
- one pilot marina can be onboarded with real inventory, pricing, policies, map, users, and payment configuration;
- the first real bookings can be monitored and supported safely.

## Execution order

Do these files in order. Do not skip ahead merely because a later task is more visually interesting.

1. `01_DEPENDENCY_AND_SUPPLY_CHAIN_SECURITY.md`
2. `02_CI_DETERMINISM_AND_RELEASE_GATE.md`
3. `03_PUBLIC_LEGAL_AND_BOOKING_CORRECTNESS.md`
4. `04_APPLICATION_SECURITY_HARDENING.md`
5. `05_STAGING_AND_ENVIRONMENT_SETUP.md`
6. `06_EXTERNAL_INTEGRATION_VERIFICATION.md`
7. `07_BACKUP_AND_RESTORE_DRILL.md`
8. `08_FINAL_RELEASE_REHEARSAL.md`
9. `09_PILOT_ONBOARDING_AND_CONTROLLED_LAUNCH.md`
10. `10_PILOT_CONSTRAINTS_AND_NON_GOALS.md`
11. `11_MASTER_PASS_FAIL_CHECKLIST.md`

## Working rule

Every task should follow the same pattern:

1. Inspect current behavior before changing code.
2. Make the smallest change that closes the identified pilot risk.
3. Add or update tests that prove the behavior.
4. Run the relevant local verification.
5. Push the exact revision.
6. Confirm remote CI/readback where required.
7. Record PASS/FAIL evidence.

Do not use Milestone 5 as an excuse for broad refactors, schema redesigns, analytics projects, a self-service marina map builder, marketplace features, billing expansion, or visual polish unrelated to a pilot blocker.

## Existing verification scripts

The repository currently exposes these useful commands:

```bash
npm run verify
npm run verify:secrets
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run test:e2e
npm run test:hold-concurrency
npm run test:assignment-concurrency
npm run stripe:verify
npm run stripe:verify-checkout
npm run build
```

Milestone 5 should improve how these are orchestrated; it should not replace working checks with weaker custom checks.

## Definition of done

The milestone can be marked complete only when `11_MASTER_PASS_FAIL_CHECKLIST.md` is entirely PASS, or when any explicitly accepted exception is documented with owner, reason, impact, mitigation, and review date.

Final milestone output:

`MILESTONE 5 — CONTROLLED PILOT READY`

or

`MILESTONE 5 — CONTROLLED PILOT NOT READY`
