# Milestone 3 — Verification

## Berth Assignment
- [ ] Suitable berth assignment works
- [ ] Incompatible/blocked/conflicting assignment rejected
- [ ] Reassignment is auditable

## Arrival / Departure
- [ ] Check-in records actual timestamp and occupancy
- [ ] Check-out records actual timestamp and clears occupancy

## Booking Changes
- [ ] ETA/ETD changes work
- [ ] Date/vessel changes rerun validation
- [ ] Invalid assignment detected
- [ ] Financial differences calculated

## Extensions / Moves
- [ ] Same-berth extension works
- [ ] Move-required extension identified
- [ ] Planned move can be confirmed
- [ ] Impossible extension rejected

## Berth Outage
- [ ] Affected booking is flagged
- [ ] Alternatives shown where possible
- [ ] No automatic customer notification
- [ ] Conflict remains until resolved

## Cancellation
- [ ] Policy applied
- [ ] Refund recommendation calculated
- [ ] Capacity released
- [ ] History preserved

## Payments
- [ ] Full/deposit/balance/outside-payment states work
- [ ] Overdue balance warns staff
- [ ] No automatic cancellation

## Audit
- [ ] Meaningful actions create audit entries
- [ ] Actor recorded
- [ ] Admin/staff visibility correct
- [ ] Cross-tenant access blocked

## Notifications
- [ ] Critical email sends
- [ ] Retry safe
- [ ] Duplicate protection
- [ ] Failure does not corrupt booking state

## Quality
- [ ] lint
- [ ] TypeScript
- [ ] production build
- [ ] unit tests
- [ ] DB/RLS tests
- [ ] assignment tests
- [ ] booking-change integration tests
- [ ] cancellation/payment tests
- [ ] notification tests
- [ ] E2E operational flow
- [ ] mobile E2E where relevant
- [ ] git diff --check

## Final Scenario
Online booking exists → assign berth → check in → update timing → extend → move if needed → handle berth issue → check out → verify audit trail → confirm tenant isolation.

## Pass Condition
> **MILESTONE 3 — OPERATIONAL BOOKING MANAGEMENT PASS**
