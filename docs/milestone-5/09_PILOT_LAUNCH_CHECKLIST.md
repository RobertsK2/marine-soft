# M5.9 Pilot Launch Checklist

Status date: 2026-10-22

## Frozen release

- Status: `PASS`
- Release tag: `v0.1.0-pilot.1`
- Release SHA: `2a7dfa2475373ba24b516e1c0103cd5ad719e939`
- GitHub tag resolves directly to the release SHA.
- Vercel deployment `9rvxYEcyVNajNYBtcq8sy35vjG6P` remains `Ready`, `Latest`, and `Current` for `berthio-staging.vercel.app`; its source is commit `2a7dfa2` on `main`.
- The frozen release tree was not changed or redeployed while preparing this checklist.
- Legal review remains intentionally deferred and is outside this launch-preparation checklist.

## Work that can be completed before the marina is selected

- [x] Freeze and tag the rehearsed release revision.
- [x] Preserve the M5.8 release evidence and rollback SHA.
- [x] Define the onboarding data required from the pilot marina.
- [x] Define the berth import validation and spot-check procedure.
- [x] Define map acceptance criteria: complete real inventory, stable SVG IDs, correct berth mapping, readable geometry, responsive view box, and marina approval.
- [x] Define account acceptance: named admin/staff users, least-privilege roles, admin MFA/AAL2, staff AAL1, and tenant-isolation checks.
- [x] Define payment acceptance for online and pay-at-marina modes.
- [x] Define notification acceptance: approved sender/recipient, controlled delivery, outbox reconciliation, scheduler readback, and duplicate protection.
- [x] Define the operational acceptance drill and evidence to record.
- [x] Define the controlled-booking gate and rollback triggers.
- [x] Define the first-week daily monitoring categories.
- [ ] Assign internal onboarding, release, incident, rollback, and first-week support owners.
- [ ] Prepare the private onboarding packet and secure collection location for customer data and provider access.
- [ ] Set the proposed launch window, acceptance-session window, rollback decision deadline, and daily first-week review time.

## Work requiring the pilot marina

### Tenant and marina configuration

- [ ] Receive the official marina name, public contact details, timezone, booking email, currency, VAT/tax rules, seasons, mandatory fees, cancellation rules, and desired payment methods.
- [ ] Agree the tenant slug and public marina slug.
- [ ] Create the real tenant and marina records using the existing tenant model.
- [ ] Keep the public page unpublished until acceptance is complete.
- [ ] Verify tenant-scoped reads and writes for the real tenant.

### Berth inventory

- [ ] Receive an authoritative berth inventory with code/name, pier/zone, maximum length, beam, draft, initial status, and any supported priority rule.
- [ ] Resolve duplicate or missing berth codes with the marina.
- [ ] Validate the import before confirmation, preserve atomic import behavior, and spot-check the imported records against the source.
- [ ] Obtain written marina confirmation that the inventory is complete and physically accurate.

### Approved map and geometry

- [ ] Receive the marina plan, aerial image, annotated image, SVG, or CAD reference.
- [ ] Produce the simplified operational SVG without inventing or omitting berths.
- [ ] Map every stable SVG berth ID to the matching database berth code.
- [ ] Verify selection behavior and dynamic status display.
- [ ] Obtain marina approval for orientation, labels, geometry, and berth mapping.

### Staff and admin accounts

- [ ] Receive each user's name, work email, and approved role.
- [ ] Provision only the required memberships in the real tenant.
- [ ] Complete admin MFA enrollment and verify AAL2.
- [ ] Verify staff AAL1 access and denial from admin-only settings.
- [ ] Verify browser tenant isolation with the real accounts.

### Payments

- [ ] Confirm whether online payment, pay at marina, or both are enabled.
- [ ] If online payment is enabled, complete the marina owner's Stripe Connect onboarding and verify the intended live account, capabilities, bank/payout setup, production keys, and production webhook.
- [ ] Run representative quotes and compare them with marina-approved manual totals.
- [ ] Perform the smallest approved controlled real transaction and verify booking, payment, webhook, payout destination, and idempotency evidence.
- [ ] Verify pay-at-marina creates no Checkout session and leaves the balance due.

### Notifications

- [ ] Receive and approve the sender identity, reply-to contact, operational recipients, and guest-facing content.
- [ ] Verify sender/domain readiness for the pilot environment.
- [ ] Send controlled notifications to approved pilot recipients and verify delivery, reconciliation, scheduler processing, retry behavior, and tenant isolation.

### Operational acceptance and controlled booking

- [ ] Conduct the staff acceptance drill: login, booking lookup/manual booking where used, assignment, map use, berth blocking, check-in, payment/balance, change/cancel, check-out, Settings, and Publishing.
- [ ] Record the staff sign-off and any release-blocking issue.
- [ ] Complete one controlled real booking from public availability through notification and operational closeout.
- [ ] Verify the booking appears only in the correct tenant and that audit/payment/notification history is correct.
- [ ] Publish the public page intentionally and limit initial traffic.

### Monitoring, rollback, and first-week support

- [ ] Name the marina and Berthio contacts authorized to approve launch and rollback.
- [ ] Confirm the rollback target, decision criteria, communications path, and authority to unpublish/stop traffic.
- [ ] Confirm current backup/restore evidence covers the production schema and record the production backup owner privately.
- [ ] Establish first-week support coverage and escalation contacts.
- [ ] Review daily: booking, payment/webhook, notification, scheduler, auth, rate-limit, capacity/assignment, and Sentry failures plus staff/guest feedback.
- [ ] Record daily disposition and expand traffic only after stable operation.

## Pilot launch gate

M5.9 remains `IN PROGRESS`. Launch requires all applicable marina-dependent items above to pass, named monitoring and rollback owners, the operational acceptance drill, and the controlled real booking. Legal review remains explicitly deferred.
