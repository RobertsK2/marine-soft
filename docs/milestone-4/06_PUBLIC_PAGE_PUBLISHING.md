# Phase 6 — Public Booking Page Publishing

## Goal

Give marina admins an explicit, safe way to control whether their Berthio public booking page is live.

## Requirements

- Admin-only publish/unpublish control.
- Unpublished marina slug must not expose the public booking flow.
- Published marina slug must continue to use existing availability, pricing, hold, checkout, and guest flows.
- Publishing must fail with a clear readiness warning if required core configuration is missing, according to explicit rules.
- Do not leak internal configuration details publicly.
- Audit publish/unpublish changes.
- Preserve existing public route behavior and tenant isolation.

## Verification

- Admin can publish a ready marina.
- Admin can unpublish a marina.
- Unpublished marina returns the expected unavailable/not-found behavior.
- Staff cannot publish if role rules disallow it.
- Cross-tenant publish attempts fail.
- Existing public booking regression tests pass.
