# M5.2 — CI Determinism and Release Gate

## Goal

Make the test/release pipeline repeatable enough that a green build means something.

The audit found two important issues:

1. the exact repository revision reviewed during the audit had a failed GitHub Actions verification;
2. the database verification behaved differently depending on reused local database state, even though a clean isolated database run could pass.

The current CI starts local Supabase and runs `npm run verify`. The repository also has separate Playwright and concurrency scripts, but those are not currently part of the basic CI workflow.

## Principle

Tests must own their required state. A test suite must not quietly depend on data left behind by a developer, another test run, or a previous seed.

## Part A — Fix test determinism

### Step 1 — Reproduce both modes

Run the database suite from a genuinely clean Supabase state, then run it again without manually cleaning state between the two runs.

Example workflow:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm run test:db
```

Also run the complete verifier twice if practical:

```bash
npm run verify
npm run verify
```

Document the exact failing test/fixture rather than treating “second run fails” as enough diagnosis.

### Step 2 — Find leaked assumptions

Look for:

- fixed UUIDs that collide across runs;
- fixed emails, slugs, booking references, hold hashes, or provider event IDs;
- test rows not cleaned up;
- tests relying on ordering from previous data;
- tests depending on a clock boundary;
- seed scripts that are not idempotent;
- unique constraints hit by previous test runs;
- concurrency tests leaving active holds or assignments;
- migrations or database tests assuming an empty table rather than creating isolated fixtures.

### Step 3 — Fix the fixture, not the symptom

Preferred fixes:

- unique per-run identifiers;
- explicit setup/teardown;
- transactions where compatible with the behavior being tested;
- deterministic seed reset at suite boundaries;
- `finally` cleanup around concurrency resources;
- assertions scoped to rows created by the current test.

Avoid hiding the issue by weakening assertions or indiscriminately deleting all local developer data from normal commands.

### Step 4 — Prove repeatability

A minimum local proof should include repeated consecutive runs. If the suite is cheap enough, run it at least three times in succession.

## Part B — Strengthen CI

### Current baseline

The existing workflow:

1. checks out the repo;
2. sets up Node;
3. runs `npm ci`;
4. installs Supabase CLI;
5. starts Supabase;
6. runs `npm run verify`.

That is useful, but the repository also exposes:

```bash
npm run test:e2e
npm run test:hold-concurrency
npm run test:assignment-concurrency
```

These protect customer-critical behavior and should be included in the release gate.

### Step 5 — Decide CI structure

Recommended structure:

**Job 1 — verify**

- secrets scan;
- lint;
- typecheck;
- unit tests;
- DB tests;
- production build.

**Job 2 — concurrency**

- clean local Supabase;
- hold concurrency test;
- berth assignment concurrency test.

**Job 3 — E2E**

- application + Supabase test environment;
- deterministic test users/data;
- Playwright suite;
- upload failure traces/screenshots as artifacts.

Jobs may run in parallel after dependencies are installed if the environment design supports it safely.

### Step 6 — Avoid CI-only mystery state

CI must create its own test environment. No test should require credentials from a developer `.env.local` unless the workflow explicitly creates equivalent ephemeral values.

Secrets needed for genuine external provider tests should not be added to ordinary untrusted pull-request jobs. Separate provider readback/release verification from safe PR CI where appropriate.

### Step 7 — Make failure actionable

Ensure a red CI run clearly says whether failure came from:

- lint;
- typecheck;
- unit;
- DB;
- build;
- hold concurrency;
- assignment concurrency;
- Playwright.

Do not collapse everything into one huge opaque shell command if it makes diagnosis unnecessarily difficult.

## Release gate rule

A release candidate cannot be pilot-ready unless the **exact commit intended for deployment** has green required checks.

A green older commit does not count.

## Exit criteria

- [ ] DB tests pass from clean state;
- [ ] DB tests pass on immediate repeated run or are explicitly isolated/reset by design;
- [ ] `npm run verify` is repeatable;
- [ ] hold concurrency test passes;
- [ ] assignment concurrency test passes;
- [ ] Playwright runs in release CI or an equally controlled release workflow;
- [ ] CI failures produce useful diagnostics/artifacts;
- [ ] exact release candidate commit is green remotely;
- [ ] no manual developer-only cleanup step is required to manufacture a green result.

## Evidence to retain

- failing baseline reproduction;
- root cause;
- test/fixture fix;
- repeated local run output;
- CI workflow diff;
- green workflow run for exact commit.
