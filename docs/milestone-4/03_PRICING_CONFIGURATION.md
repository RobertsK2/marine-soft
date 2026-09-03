# Phase 3 — Pricing, Seasons, and Fees Configuration

## Goal

Allow marina admins to configure the pricing engine already used by public booking flows.

## Requirements

- Admin-only tenant-safe pricing settings.
- Configure fixed-by-length-interval or per-meter pricing where already supported.
- Configure seasonal date ranges and nightly rates.
- Configure VAT inclusive/exclusive behavior.
- Configure mandatory fees supported by the existing pricing engine.
- Validate overlapping or invalid seasonal ranges.
- Validate currency/minor-unit values server-side.
- Existing confirmed booking price snapshots must remain immutable.
- Pricing changes affect only new pricing calculations unless existing product rules explicitly allow repricing through a booking-change flow.
- Audit meaningful pricing changes.
- No redesign of checkout or Stripe flow.

## Verification

- Valid pricing configuration produces expected server-side quote totals.
- Invalid season overlaps are rejected.
- Invalid negative rates/fees are rejected.
- Existing booking snapshots remain unchanged.
- Cross-tenant pricing access fails.
- Relevant pricing and public-booking regression tests pass.
