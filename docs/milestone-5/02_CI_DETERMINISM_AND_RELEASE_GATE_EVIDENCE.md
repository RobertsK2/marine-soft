# Milestone 5 Task 2 — CI determinism and release-gate evidence

## Current result

**MILESTONE 5 TASK 2 — LOCAL RELEASE GATE PASS**

Verified locally on 2026-09-16 from branch
`milestone-5/task-1-dependency-security`, after correcting a stale E2E fixture
date. No Task 3 work was started.

## Recovery findings

- Local HEAD at the start of this sweep was `5567746a` (`milestone5 - phase2`).
- The cached remote task branch was `43beab3`; local history was ahead by one
  commit and was not diverged.
- `git fetch origin` failed because this host has no usable GitHub SSH public
  key. The cached remote-tracking refs therefore were not refreshed.
- Docker Desktop 4.87.0 and its Linux engine are healthy now; WSL2's
  `docker-desktop` distribution is running. The earlier `sailor-ingest.sock`
  failure did not reproduce.
- The first DB attempt left the generated project
  `berthio-db-test-5df5f076` holding port 56322. Its exact temporary workdir was
  verified and that generated fixture was stopped with the pinned CLI. The
  developer `berthio` project was not reset or removed.

## Notification SQL018

`supabase/tests/database/018_notifications.test.sql` passed in all three full
DB-suite repetitions, including both historical notification assertions:
`upcoming arrival reminder is queued` and
`berth outage does not notify the customer before staff resolves it`.

The suspected UTC/marina-local mismatch was inspected but not treated as the
root cause because it did not reproduce in the isolated current run. The
historical failure remains unproven; no notification SQL or production
scheduler change was made.

## Verification table

| Check | Status | Evidence |
| --- | --- | --- |
| Task 1 dependency/security | PASS locally | `npm.cmd audit --json`: 0 info/low/moderate/high/critical vulnerabilities; secret scan, lint, typecheck, unit tests, DB tests and build passed in the recorded Task 1 evidence. Remote CI is not verified. |
| Task 2 CI determinism/release gate | PASS locally | Isolated DB runner, separate concurrency fixtures, full E2E fixture/user setup, and aggregate workflow inspection all passed locally. |
| DB deterministic verification | PASS | `npm.cmd run test:db`: 3 consecutive complete runs, each 28 files / 672 assertions, zero failures; generated fixture cleaned up. |
| Notification SQL018 | PASS | Passed in each of the three DB repetitions. |
| Hold concurrency | PASS | `npm.cmd run test:hold-concurrency`: capacity and anonymous-session quota races serialized within limits; fixture cleaned up. |
| Assignment concurrency | PASS | `npm.cmd run test:assignment-concurrency`: one assignment and one conflict; fixture cleaned up. |
| Playwright E2E | PASS locally | `npm.cmd run test:e2e`: 128 passed, 10 skipped, 0 failed. Skips are six device-inapplicable executions and four real Stripe-provider executions requiring credentials. |
| GitHub CI | NOT RUN / external verification required | Workflow includes verify, concurrency, E2E, and aggregate release-gate jobs. GitHub fetch was blocked by SSH authentication, so no green remote run is claimed. |
| Legal/public correctness | NOT RUN | Requires the separate milestone verification and review evidence. |
| Security hardening | NOT RUN | Requires the separate milestone verification and review evidence; dependency audit and secret scan are covered above. |
| Staging/providers | NOT RUN / manual verification required | No staging Supabase, Stripe, Postmark, Sentry, scheduler, or provider readback was performed. |
| Backup/restore | NOT RUN / manual verification required | No backup or restore drill was performed. |
| Final release rehearsal | NOT RUN | Must follow the remaining milestone evidence and external checks. |

## Commands run in this sweep

| Command | Result |
| --- | --- |
| `npm.cmd run verify:secrets` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run test` | PASS; 37 files, 241 tests |
| `npm.cmd run build` | PASS; Next 16.3.3, 34 pages generated |
| `npm.cmd audit --json` | PASS; zero vulnerabilities |
| `npm.cmd run test:db` | PASS; 3 × 28 files / 672 assertions |
| `npm.cmd run test:hold-concurrency` | PASS |
| `npm.cmd run test:assignment-concurrency` | PASS |
| targeted E2E rerun for the corrected test | PASS; 2/2 |
| `npm.cmd run test:e2e` | PASS; 128 passed, 10 skipped, 0 failed |

## Code change

The E2E test used `2026-09-15` as its arrival date. On the current run the
marina-local date was `2026-09-16`, so the application correctly rejected the
fixture as being before today. The fixture now uses `2026-09-17` through
`2026-09-20`, still within the seeded Baltic high-season tariff. The targeted
and complete E2E reruns passed on Chromium and mobile. No application,
database, RLS, booking, payment, notification, or concurrency behavior was
changed.

## Remaining external boundary

The local release gate is green. GitHub synchronization and remote CI remain
manual because SSH authentication failed with `Permission denied (publickey)`;
no force push, rebase, merge to main, or history rewrite was performed. After
GitHub access is restored, push the valid local commits normally and run the
workflow for the exact revision. Do not treat this external step as local test
evidence.
