# M5.1 — Dependency and Supply-Chain Security

## Goal

Remove known dependency vulnerabilities that are unacceptable for a public pilot without creating unnecessary upgrade risk.

The audit identified multiple known dependency vulnerabilities and specifically flagged the current Next.js baseline as needing a security update. At the time of the audit, the repository used Next.js `16.3.0`; the audit referenced patched releases beginning at `16.3.3` for the relevant issue set. Treat the current advisory state as something to re-check at execution time rather than assuming the audit will remain current forever.

## Why this is first

There is no value in proving a release candidate that already contains a known critical framework vulnerability. Dependency security therefore comes before UI polish, staging provider setup, or final E2E evidence.

## Scope

In scope:

- inspect `npm audit` output;
- identify runtime vs development-only findings;
- update Next.js and tightly coupled packages to patched compatible versions;
- update other vulnerable direct/transitive packages when the upgrade is low-risk and justified;
- keep React, Supabase, Stripe, Sentry, Playwright, and tooling compatible;
- regenerate lockfile through normal package-manager behavior;
- prove the application still builds and core flows still work.

Out of scope:

- random major-version modernization;
- replacing frameworks;
- switching package managers;
- broad code cleanup unrelated to the advisories;
- forcing upgrades simply to obtain the newest version number.

## Step-by-step

### Step 1 — Capture the baseline

Before changing dependencies:

```bash
node --version
npm --version
npm audit
npm ls next react react-dom
npm run verify
```

Save the relevant advisory IDs, severity, affected package, affected version range, and whether the package is used in production runtime.

### Step 2 — Inspect the current Next.js advisory situation

Confirm the currently installed Next.js and `eslint-config-next` versions in `package.json` and lockfile. Check the current security advisory rather than blindly relying on the previous audit timestamp.

Target the **smallest patched compatible release** unless a later patch release is clearly safer and does not introduce unnecessary migration work.

When Next.js is updated, keep `eslint-config-next` aligned unless there is a documented compatibility reason not to.

### Step 3 — Update one risk group at a time

Prefer grouped, explainable updates:

1. Next.js + matching Next ESLint config.
2. Direct vulnerable runtime dependencies.
3. Vulnerable development dependencies if they can affect CI/build supply chain.
4. Transitive issues that require parent-package updates.

Do not accept automated `npm audit fix --force` changes without reviewing the resulting dependency graph and diffs.

### Step 4 — Verify after each material update

At minimum:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```

If the update touches Next.js routing, middleware, server actions, cookies, headers, or server/client boundaries, also run public booking and admin E2E coverage.

### Step 5 — Re-run the security scan

```bash
npm audit
npm run verify:secrets
```

Any remaining high/critical advisory must be one of:

- fixed;
- proven unreachable/non-applicable with evidence;
- explicitly accepted for the controlled pilot with written mitigation and owner.

“npm still reports it but it probably does not matter” is not a valid pass condition.

### Step 6 — Push and validate CI

Push the dependency commit and confirm CI on the exact commit. Do not continue to later milestone phases while the dependency revision is red.

## Regression checks

Manually smoke-test after framework/runtime updates:

- `/login` renders and authenticates;
- `/dashboard` loads after auth;
- public marina booking page renders;
- availability check works;
- mobile booking step transition works;
- online payment path reaches Stripe test checkout;
- pay-at-marina path does not open Stripe;
- admin bookings page loads payment states correctly;
- server actions still return expected validation errors rather than generic 500s.

## Exit criteria

PASS only when:

- [ ] current dependency audit has been reviewed;
- [ ] relevant high/critical runtime vulnerabilities are resolved or formally accepted;
- [ ] Next.js is on a patched version appropriate to the advisory state at execution time;
- [ ] lockfile is committed and reproducible with `npm ci`;
- [ ] lint passes;
- [ ] typecheck passes;
- [ ] unit tests pass;
- [ ] database tests pass in the expected clean environment;
- [ ] production build passes;
- [ ] remote CI for the dependency revision is green.

## Evidence to retain

Record:

- release commit SHA;
- `npm audit` summary;
- package versions before/after;
- CI run URL/status;
- any accepted advisory exception and justification.
