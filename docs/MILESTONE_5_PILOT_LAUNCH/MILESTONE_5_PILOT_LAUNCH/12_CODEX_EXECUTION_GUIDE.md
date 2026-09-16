# M5.12 — Codex Execution Guide

## Purpose

Use Codex as an implementation agent for Milestone 5 without allowing each task to become a broad refactor.

The safest pattern is **one Milestone 5 file = one focused Codex task or a very small sequence of tasks**.

## Standard prompt header

Start each Codex task with:

> You are working on Berthio Milestone 5 pilot launch readiness. Read the relevant Milestone 5 markdown file and inspect the current repository before changing code. Treat the document as the acceptance criteria, not as permission for a broad rewrite. Preserve existing booking, pricing, payment, tenant/RLS, availability, hold, notification, and admin behavior unless the task explicitly requires a change. Prefer the smallest production-safe change. Do not invent new product features. Do not expose secrets. After implementation, run the exact verification required by the milestone file and report PASS/FAIL with changed files, tests run, and any remaining risks.

Then append the relevant file-specific instructions.

## Task order

### Task 1 — Dependency/security patch

Give Codex `01_DEPENDENCY_AND_SUPPLY_CHAIN_SECURITY.md`.

Ask it first to **audit and propose the minimal version changes**, then implement. Avoid “upgrade everything”.

### Task 2 — Deterministic tests

Give Codex `02_CI_DETERMINISM_AND_RELEASE_GATE.md`.

Have it reproduce the repeated DB run before touching fixtures. Require a root-cause explanation.

### Task 3 — CI expansion

Once local determinism is PASS, use the second half of file 02 to add concurrency/E2E release checks.

### Task 4 — Public correctness

Give Codex `03_PUBLIC_LEGAL_AND_BOOKING_CORRECTNESS.md`, but provide separately approved legal text for Terms/Privacy. Do not let Codex manufacture legal wording.

### Task 5 — Security hardening

Use `04_APPLICATION_SECURITY_HARDENING.md` in smaller commits if needed:

1. headers/CSP;
2. availability rate limiting;
3. MFA/auth policy implementation.

Re-run auth, public booking, and provider flows after security policy changes.

### Task 6 — Staging

File 05 is mainly an operations checklist. Use Codex only for deployment-config/code changes that are actually required. Do provider/account setup manually in the appropriate dashboards/secret stores.

### Task 7 — Providers

Use file 06 as the readback checklist. Codex can improve tests/scripts if necessary, but the actual Stripe/Postmark/Sentry/scheduler evidence must come from the deployed external services.

### Task 8 — Backup/restore

Use file 07. Do not let an automated agent issue destructive restore commands against production/staging. Restore only into a clearly isolated target.

### Task 9 — Release rehearsal

Use file 08 and require Codex to report results, not silently patch every failure. If a failure requires code changes, fix it separately and restart the relevant release gate.

### Task 10 — Pilot onboarding

Use file 09 as the customer onboarding runbook. This is primarily human-operated. Codex is useful for SVG generation/integration, safe import tooling, or diagnosing configuration issues.

## Codex report format

For every Milestone 5 task, require:

```text
Scope completed:
Changed files:
Database/schema changes:
Security impact:
Tests run:
PASS/FAIL:
Remaining blockers:
Manual verification still required:
```

## Rule for schema changes

If Codex believes a schema change is necessary, require it to explain:

1. why existing columns/functions cannot support the requirement;
2. migration forward behavior;
3. rollback/compatibility impact;
4. RLS/security impact;
5. tests added.

Do not accept schema churn for UI-only or environment-only tasks.

## Rule for external services

Codex can verify code paths, but it cannot replace real provider readback. A mocked Stripe webhook or mocked Postmark response does not complete the external verification file.

## Rule for failed release checks

Never ask Codex to “make all tests green by any means”. Ask it to diagnose the failure while preserving the intended assertions and security guarantees.
