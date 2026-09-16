# Milestone 5 Task 2: determinism and release gate

Dates: 2026-09-11–13. Baseline: `43beab3` (Task 1 accepted as verified).
Acceptance criteria: the supplied `02_CI_DETERMINISM_AND_RELEASE_GATE.md` in
`docs/MILESTONE_5_PILOT_LAUNCH/MILESTONE_5_PILOT_LAUNCH/`.

## Root cause and reproduction

The baseline CI reset its disposable Supabase database, but ordinary `npm run
verify` / `test:db` used the developer's existing project. All 28 SQL test files
have BEGIN/ROLLBACK, but their input fixtures assume the original seeded tenant,
berths, pricing catalog, booking lifecycle states and integration activity.
Rollback cannot undo changes made before the test transaction started.

Baseline `npm.cmd run test:db` against existing `berthio` failed:

- 010: assignment tests 9-11 and 13; expected blocked/out-of-service berths had
  been changed to available. The unexpected successful reassignment then caused
  multiple historical rows and a scalar-subquery error at line 47.
- 023: integration-health tests 11-15 included prior developer/provider activity
  (6 webhook events instead of 1, 8 pending payments instead of 1, 7 failed
  payments instead of 0, and 28 queued notifications instead of 1).
- 024: missing seed pricing season meant deleting its rates did nothing; test 17
  failed, and re-inserting a rate failed its foreign key at line 79.
- 026: pilot bookings had 4 distinct lifecycle states rather than the expected 3.

The previously isolated local baseline project passed three immediate consecutive
DB runs: 28 files / 672 assertions each, without resets. There was no observed
second-run SQL leakage in that environment. Fixed seed assumptions, rather than
random retries, explain the reproduced failure.

Concurrency inspection also found that the first hold race was outside cleanup
on assertion failure, and assignment cleanup ignored returned database errors.

Browser diagnosis also reproduced a real manual-booking hydration race. With
client scripts deliberately held in the browser, the server-rendered controlled
arrival input accepted `2085-01-01`; after scripts loaded and a second field was
edited, arrival was empty. This explains the later audit E2E validation failure.
The minimal fix disables controlled inputs and submission until hydration; it
does not change booking calculations, validation, persistence or authorization.
See [Playwright hydration guidance](https://playwright.dev/docs/navigations#hydration).

## Changes

- `scripts/test-database.mjs`: creates a fresh temporary Supabase project from
  the checked-in migrations/seeds/tests/templates, uses local DB port 56322,
  runs the unmodified DB suite three consecutive times, then removes only the
  generated project's containers/volumes. It never resets `berthio`, accepts a
  supplied remote DB URL, or reuses a developer workdir. Temporary source copies
  remain under the OS temp directory for diagnostics.
- `scripts/test-integration.mjs`: owns a fresh local API/auth/Mailpit/database
  fixture on ports 57321-57329 for each concurrency/E2E invocation. Uses the pinned
  repository Supabase CLI, seeds current migrations, generates ephemeral passwords,
  invokes the existing test-user setup with tenant isolation readback, and creates
  a separate Marina B recovery user. It overrides application/provider env values
  so a developer `.env.local` cannot supply external credentials to the app.
  Local signing secrets are generated in memory. Auth test throughput limits are
  raised only in the temporary config to support the suite's many rapid logins;
  production config and application rate-limit assertions remain unchanged.
  On failure the runner retains allowlisted local-auth route/status/duration
  diagnostics before teardown, without printing raw logs, tokens or bodies.
- `package.json`: existing DB/concurrency/E2E commands use these isolated runners;
  `verify` and its constituent assertions are preserved. No dependency change.
- Concurrency scripts: require loopback targets; hold cleanup covers all generated
  idempotency keys in finally; assignment cleanup checks every returned error.
- `playwright.config.ts`: no retries, retained failure traces/screenshots, HTML
  report, and no accidental reuse of a developer web server in isolated runs.
- `eslint.config.mjs`: ignore generated Playwright report/trace/result directories
  (already Git-ignored). Running lint after E2E had incorrectly linted vendored
  JavaScript in the report, producing 257 errors and 2,774 warnings. Source lint
  rules remain unchanged; lint and typecheck now pass with reports present.
- `tests/e2e/public-and-auth.spec.ts`: Mailpit URL comes from the test environment.
  The old login test's expectation that tenant identity disappears on Berths
  contradicted the persistent DashboardShell and the newer admin-loading test.
  Replaced it with exact one-tenant identity, Marina A presence and Marina B absence;
  password login, navigation and logout assertions remain.
  A subsequent run exposed another obsolete selector (`.app-status`) after a
  successful timezone save. The test now reloads the form and checks persisted
  Europe/London plus its public-page display. Inspection of the same redesigned
  shell found obsolete staff-role/tenant text and audit navigation/history names;
  selectors now follow the current visible user identity and labelled audit
  regions, retaining staff denial, tenant isolation, event and actor assertions.
  The public email link is now labelled Contact; its assertion checks the exact
  `mailto:` destination containing the newly saved email instead of its old label.
  The add-berth status selector now targets the Initial Status combobox, avoiding
  an ambiguous match against the redesigned Status & Allocation region.
- `.github/workflows/ci.yml`: separate verify, concurrency-tests and e2e jobs plus
  a final release-gate requiring all three results to be success. No repeated
  lint/build in other jobs, no continue-on-error, no provider secrets in PR jobs.
  Playwright installs Chromium/system dependencies and uploads only browser
  diagnostics for seven days, including failures. CLI installation comes from
  the lockfile, avoiding duplicate global setup.

- `src/components/bookings/booking-form.tsx`: prevent pre-hydration input loss,
  with server-disabled inputs and submit button enabled after React hydration.
  The marine UI skill was applied to preserve the existing layout and styling;
  no redesign or new visual assets were introduced.
- `tests/e2e/booking-hydration.spec.ts`: delayed-script regression verifies
  disabled controls before hydration, usable controls afterward, and retained
  arrival input after editing another field. It uses real local Supabase, not
  mocked authentication or booking services.
- `tests/e2e/publishing-settings-layout.spec.ts`: assert all six current readiness
  items by name, including Accepted Payment Methods, instead of the obsolete
  five-item count. Existing publication, stale-write and tenant checks remain.

No schema, migration, RLS, booking-domain or payment behavior changed. The only
production change is the manual-booking form's hydration readiness guard.
The user's pre-staged milestone documents and ZIP are unrelated and preserved.

## Exact local commands and results

Windows Node v24.19.0 / npm 12.0.2; `npm.cmd` bypasses only the blocked PowerShell
wrapper. CI remains Node 22 and needs remote execution evidence.

1. Baseline `npm.cmd run test:db`: FAIL on the reused developer database, as above.
2. Set `SUPABASE_WORKDIR` to
   `C:/Users/Roberts/AppData/Local/Temp/berthio-m5-task1-b6f87fd401fb41759e73082dfd904b81`
   in a separate shell and run baseline `npm.cmd run test:db` three times: PASS
   672/672 each, no cleanup/reset between runs.
3. After implementation, ordinary `npm.cmd run test:db`: PASS, three internal
   consecutive runs of 672 assertions. Generated project `berthio-db-test-0a77424e`.
4. `npm.cmd run test:hold-concurrency`: PASS capacity and quota races, local
   fixture `berthio-integration-950018c8`; fixture cleaned up successfully.
5. `npm.cmd run test:assignment-concurrency`: PASS one assigned / one conflict,
   local fixture `berthio-integration-0b418b06`; cleanup succeeded.
6. `npm.cmd run verify`: PASS secrets, lint, typecheck, 37 unit files / 241 tests,
   three DB runs of 672 assertions, production build (34 static pages).
   Project `berthio-db-test-1df53840` was created and removed automatically.
7. Immediate second `npm.cmd run verify`: PASS the same checks/counts without any
   manual cleanup. Project `berthio-db-test-f5c462be` was created and removed.
8. `npm.cmd run test:e2e -- --max-failures=1`: first run stopped at the stale tenant
   layout assertion after 45 passes; 1 mobile-only test was inapplicable on desktop,
   89 tests had not run. This failed run is not treated as a suite pass.
9. Second browser run passed the corrected login/logout check and stopped at the
   removed `.app-status` selector after 47 passes. That run is also FAIL. Browser
   third run passed persisted timezone checks but failed the obsolete email link
   label (47 passes, 1 device skip, 87 not run). The captured public page showed
   the correct new email in Contact's href. All three runs remain recorded as FAIL.
10. `npm.cmd run verify:secrets`, `git diff --check`, and parsing the workflow with
    js-yaml: PASS. Workflow inspection confirms all requested commands and failure
    behavior. `npm.cmd run lint` and `npm.cmd run typecheck` after the generated
    artifact ignore and Contact assertion changes: PASS.
11. `npm.cmd run test:e2e -- tests/e2e/public-and-auth.spec.ts --max-failures=1`:
    corrected profile, publishing, staff, audit, tenant and recovery checks passed.
    FAIL after 22 passes: the following admin login POST was still pending at the
    five-second URL assertion. Trace showed no completed response, not a rejected
    password. No timeout or retry was added; root cause remains unproven.
12. `npm.cmd run test:e2e -- tests/e2e/public-and-auth.spec.ts --grep 'password recovery|create and operate a berth' --max-failures=1`:
    recovery and subsequent login succeeded unchanged. FAIL at the ambiguous
    add-berth Status selector (section plus select); local Auth returned 200 for
    token requests in roughly 90–140 ms. Selector fixed to the named combobox.
    This diagnostic subset is not a full-suite pass.
13. Public/auth rerun on `berthio-integration-d7682214`: FAIL after 22 passes
    on old berth detail wording (Not allowed vs labelled Allow Smaller Vessels:
    No). Scoped the retained property/status/dimension assertions to the current
    specifications and summary regions.
14. Public/auth rerun on `berthio-integration-73e97513`: FAIL after 19 passes.
    Audit booking creation timed out; snapshot showed an empty arrival field and
    server validation error despite the earlier successful fill. Local Auth
    requests succeeded. The controlled form can accept input before React
    hydration and then reset it. Targeted delayed-script reproduction follows.
    Inspection also found the older booking scenarios did not open operational
    disclosures required by the current page and newer layout tests. Those
    scenarios now use actual disclosure clicks and scoped record/status checks.
15. `npm.cmd run test:e2e -- tests/e2e/booking-hydration.spec.ts --project=chromium --max-failures=1`:
    baseline FAIL: entered arrival `2085-01-01` became empty after hydration and
    editing Customer name. Fixture `berthio-integration-3f0cc243` was cleaned up.
    Added the readiness guard and retained the value-preservation assertion,
    alongside new assertions that controls are disabled until hydrated.
16. `npm.cmd run test:e2e -- tests/e2e/booking-hydration.spec.ts tests/e2e/public-and-auth.spec.ts --max-failures=1`:
    new desktop hydration regression PASS; 29 tests passed, including audit,
    berth operations, CSV import, map, cancellation, assignment/reassignment,
    check-in/out and extension with a required move. FAIL in the final desktop
    manual-booking scenario: an unscoped guest assertion ran before navigation
    from detail to list completed. Added explicit list-URL synchronization and
    asserted the guest/status on its specific booking row. Mobile had not run.
    Fixture `berthio-integration-08563742` was cleaned up.
17. Full `npm.cmd run test:e2e -- --max-failures=1` on
    `berthio-integration-6210511f`: FAIL after 61 passes and 4 existing prerequisite
    skips; 72 not run. All desktop public/auth scenarios now passed. Publishing
    layout still expected five readiness items; the current component has six,
    including Accepted Payment Methods. Updated the count/summary and added exact
    names for all six. Three of the four skips were mobile-only tests (including
    Pay at Marina); the fourth required real Stripe Checkout credentials.
18. Full `npm.cmd run test:e2e -- --max-failures=1` on
    `berthio-integration-620b64bc`: **PASS, 128 passed / 10 skipped / zero failures,
    6.6 minutes, zero retries**. Both desktop and mobile hydration regressions,
    all public/auth operations, publishing checks and mobile Pay at Marina passed.
    The 10 existing skips are six device-inapplicable executions and four real
    Stripe executions (two provider tests across two projects). No local test
    was skipped for missing local credentials. `.last-run.json` says passed with
    an empty failedTests array. The generated fixture was removed successfully.
19. Final post-E2E `npm.cmd run verify` plus sequential
    `npm.cmd run test:hold-concurrency` and `npm.cmd run test:assignment-concurrency`:
    **FAIL / environment blocked on 2026-09-13**. Secrets, lint, typecheck and
    37 unit files / 241 tests passed. DB startup failed before SQL execution:
    Docker engine returned HTTP 500 for container inspection. Hold startup
    failed before racing; assignment was not run because the chain stopped.
    Cleanup also failed because the same engine could not list containers.
    `docker desktop status` confirmed `Status: stopping`; no application/test
    assertion failed in this attempt. No source changes during these checks.
20. Independent `npm.cmd run build`: **PASS**, TypeScript and all 34 static pages.
    `git diff --check` and final workflow parse/ordering inspection: **PASS**.
    `git ls-remote origin refs/heads/main`: still FAIL, public-key permission denied.

One local Supabase startup warned that its optional pg-delta migration catalog
cache timed out. The database health/startup and all SQL tests succeeded; no
health checks or assertions were bypassed. Test runners propagate nonzero exit
statuses, including cleanup failures.

## PASS/FAIL and manual boundaries

Browser gate: **PASS locally**. Task 2: **FAIL / environment-blocked** until Docker
is healthy, final verifier/concurrency reruns finish, and the exact revision is
green remotely. Task 3 has not started. Earlier repeated verifier/DB/concurrency
passes remain valid historical evidence, not substitutes for the blocked rerun.

MANUAL ACTION REQUIRED: restore Docker Desktop to Running. It was already
Stopping when the final checks attempted to inspect containers. No daemon
restart, developer-project reset or production/staging operation was performed.
Once healthy, inspect and clean up only any resources bearing these generated
project identities from the failed attempt (existence could not be confirmed):

- `berthio-integration-9288a1ef`, workdir
  `C:/Users/Roberts/AppData/Local/Temp/berthio-integration-HO3ZhN`
- `berthio-db-test-a770ca42`, workdir
  `C:/Users/Roberts/AppData/Local/Temp/berthio-db-test-KL5ops`

Use the pinned CLI's `stop --project-id <exact generated identity> --no-backup
--workdir <matching path>` only after readback confirms that pairing. Do not
stop/reset `berthio` or the pre-existing Task 1 project. Then rerun `npm run
verify`, `npm run test:hold-concurrency`, and `npm run test:assignment-concurrency`.

MANUAL ACTION REQUIRED: restore Git write access and run the exact revision in CI.
`git ls-remote origin refs/heads/main` still reports `Permission denied (publickey)`.
No remote green result or CI URL is claimed for this change. Require the
`release-gate` check in repository branch protection (provider/account setting).

The existing real-provider tests `public-checkout.spec.ts` and
`stripe-local-phase6.spec.ts` require real Stripe test credentials and a listener.
Their prerequisite skips in secret-free PR CI are not provider verification.
Run them in the controlled provider/release environment under Task 6/8 and retain
real provider evidence. Local synthetic Stripe-event RPC tests only verify local
application behavior. No provider responses have been fabricated.

Ordinary `npm run verify` now requires Docker but no running developer Supabase
project or manual reset. Each integration command creates its own local users;
no developer password or `.env.local` is required. Run integration commands
sequentially locally: they intentionally reserve one known test port range and
fail on port collisions instead of attaching to an unrelated server.
