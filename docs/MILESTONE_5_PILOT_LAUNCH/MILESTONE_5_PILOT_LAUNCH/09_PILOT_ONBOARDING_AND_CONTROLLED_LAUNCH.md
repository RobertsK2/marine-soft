# M5.9 — Pilot Onboarding and Controlled Launch

## Goal

Onboard the first real marina into the shared multi-tenant Berthio production application without creating a custom code fork for the customer.

Berthio remains one SaaS codebase/deployment. The marina is a tenant with its own configuration/data.

## Phase A — Collect onboarding material

Request from the marina:

### Business/configuration

- official marina name;
- public website/contact details;
- operating timezone;
- booking/contact email;
- pricing/currency/VAT information;
- seasonal pricing rules;
- mandatory fees;
- cancellation policy;
- desired payment methods: online, pay at marina, or both;
- staff/admin users.

### Berth inventory

Prefer CSV with:

- berth code/name;
- pier/zone;
- maximum length;
- maximum beam;
- maximum draft;
- initial status;
- priority or smaller-vessel policy where supported.

### Map material

Accept one or more:

- PDF marina plan;
- scanned plan;
- aerial image;
- drone photo;
- annotated image;
- existing SVG/CAD export if available.

For the pilot, SVG map creation is an onboarding service, not a self-service product feature.

## Phase B — Create tenant

Create/configure the marina in the existing production tenant model.

Verify:

- marina ID/slug;
- timezone;
- membership/roles;
- public page state initially unpublished unless intentionally testing;
- tenant-scoped reads/writes.

## Phase C — Import inventory

Use the existing berth CSV import where appropriate.

Rules:

- validate before confirming;
- preserve atomic import semantics;
- resolve duplicate/missing codes before launch;
- verify physical limits against the customer-provided source;
- manually spot-check inventory after import.

## Phase D — Produce pilot SVG map

Use customer map imagery as a reference and build a simplified operational SVG.

Requirements:

- each berth maps to one real berth code;
- stable SVG IDs;
- no invented berths;
- no missing berths;
- clear pier geometry;
- readable boat-like berth representation;
- status color remains dynamic in the application;
- responsive `viewBox`;
- click/selection behavior maps to the correct database berth.

Before launch, have the marina verify the map visually.

## Phase E — Configure pricing and policies

Set:

- currency;
- base pricing;
- seasons;
- mandatory fees;
- VAT/tax;
- cancellation tiers;
- payment methods.

Run representative quotes and compare them with manually calculated expected totals.

Do not publish if a pricing mismatch is unresolved.

## Phase F — Connect payments

For online payments:

- complete/verify the marina’s intended Stripe Connect onboarding;
- ensure Berthio references the correct account;
- verify production mode intentionally;
- verify production webhook endpoint/signature;
- perform the smallest safe controlled real transaction appropriate to the pilot plan.

For pay-at-marina:

- verify booking creates no Stripe Checkout;
- verify balance displays as due at marina.

## Phase G — Configure notifications

Verify sender, templates/current email content, scheduler, and delivery.

Use internal/pilot test recipients before enabling guest traffic.

## Phase H — Staff acceptance session

With marina staff, perform a short acceptance drill:

- login;
- find booking;
- add/manual booking if part of their workflow;
- assign berth;
- use berth map;
- block/out-of-service berth;
- check-in;
- see payment/balance;
- cancel/change booking;
- check-out;
- understand where Settings/Publishing live.

Record confusion or bugs, but do not immediately expand product scope unless the issue blocks real pilot operation.

## Phase I — Controlled go-live

Recommended rollout:

1. production tenant configured but unpublished;
2. internal real-environment booking test;
3. marina staff test;
4. publish public page;
5. route a limited amount of marina-owned traffic;
6. monitor first bookings closely;
7. expand only after stable operation.

## Phase J — First-week monitoring

Review daily during the earliest pilot period:

- booking failures;
- payment/webhook failures;
- notification failures;
- rate-limit anomalies;
- unexpected capacity/assignment conflicts;
- auth failures;
- Sentry issues;
- marina staff feedback;
- guest confusion at the booking funnel.

For critical incidents, prefer reverting/mitigating the smallest failing change over shipping unrelated improvements.

## Exit criteria

- [ ] real tenant created correctly;
- [ ] users/roles verified;
- [ ] berth inventory verified;
- [ ] SVG map approved by marina;
- [ ] pricing verified against manual examples;
- [ ] cancellation policy configured;
- [ ] payment methods configured;
- [ ] Stripe production setup verified if online payment is enabled;
- [ ] notification delivery verified;
- [ ] staff acceptance drill completed;
- [ ] public page published intentionally;
- [ ] first controlled booking completed;
- [ ] monitoring/support owner identified.
