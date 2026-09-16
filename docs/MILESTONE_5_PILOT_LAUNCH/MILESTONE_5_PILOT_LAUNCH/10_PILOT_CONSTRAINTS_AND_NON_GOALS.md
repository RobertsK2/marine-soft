# M5.10 — Pilot Constraints and Non-Goals

## Goal

Prevent Milestone 5 from turning into another open-ended product-development cycle.

A controlled pilot is allowed to have explicit constraints. Unknown or accidental limitations are dangerous; documented limitations are manageable.

## 1 — Multi-marina account constraint

The audit indicated that the current authorization/session model appears oriented around a single active marina context rather than a fully generalized organization user switching seamlessly among many marinas.

For the first pilot, do **not** redesign this unless the selected pilot customer actually requires multi-marina account switching.

Pilot constraint:

> Each pilot admin/staff account operates within the marina context supported by the current authorization model. Multi-marina organization switching is outside Milestone 5 unless it becomes a real pilot blocker.

Tenant isolation must still remain strict.

## 2 — SVG map creation remains assisted/manual

Do not build a self-service map editor or AI map ingestion platform in Milestone 5.

For early pilot customers:

- collect aerial/PDF/map material;
- create the SVG manually/AI-assisted;
- validate berth IDs against inventory;
- ask marina staff to approve it.

This is an onboarding operation, not a missing MVP feature.

## 3 — No marketplace

The pilot remains marina-owned distribution. Guests reach the marina’s hosted Berthio page from the marina’s website/link.

Do not add:

- marina discovery marketplace;
- cross-marina availability search;
- consumer account ecosystem;
- recommendation engine.

## 4 — No unnecessary payments expansion

Existing pilot payment modes:

- online via current Stripe Connect architecture;
- pay at marina where marina configuration permits.

Do not add during M5:

- deposits;
- partial payments;
- POS terminal integration;
- invoicing suite;
- cash register;
- saved cards;
- alternative payment processors;
- automated refund redesign.

## 5 — No large design-system rewrite

Brand color, spacing, and micro-polish may be done after the release-critical work is closed.

Fix visual issues before pilot only when they:

- make the workflow confusing;
- hide critical information;
- break mobile/desktop usability;
- expose fake/incorrect customer-facing claims;
- make the marina map operationally unusable.

Do not restart every screen from Stitch references during M5.

## 6 — No unrelated backend architecture rewrite

Do not split the Next.js application into separate services merely because production is approaching.

Do not introduce:

- Kubernetes;
- a message broker solely for architectural aesthetics;
- per-marina databases/deployments;
- a new auth provider;
- a custom payment ledger replacing working logic.

The current architecture should be hardened, observed, and verified first.

## 7 — Analytics is optional

If PostHog is enabled, verify privacy and delivery. If it is not enabled, the pilot does not need to be blocked solely to add product analytics.

Operational error monitoring is higher priority than growth analytics.

## 8 — Marketing/landing page is not the pilot release gate

The root marketing page can be completed after the operational product is safe enough to pilot, unless the customer specifically requires it for the agreed onboarding/public flow.

The marina-specific public booking page is the relevant guest surface.

## 9 — Legal content is not optional

Unlike marketing polish, real Terms/Privacy content is a launch requirement because current placeholders/stale branding are public trust and compliance debt.

## Change-control rule

Any proposed Milestone 5 task should answer:

1. What concrete pilot risk does this remove?
2. What is the smallest implementation that removes it?
3. How will we prove it works?
4. Does it invalidate previous release evidence?

If there is no strong answer, place it in a post-pilot backlog.
