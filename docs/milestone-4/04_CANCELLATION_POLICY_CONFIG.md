# Phase 4 — Cancellation Policy Configuration

## Goal

Replace hard-coded pilot cancellation thresholds with explicit marina-owned configuration while preserving safe cancellation behavior.

## Requirements

- Admin-only tenant-safe policy configuration.
- Support the current refund recommendation model as configurable tiers.
- Store policy in a clear, auditable format.
- Validate tier ordering, day thresholds, and refund percentages.
- Cancellation preview must use the marina policy active at evaluation time according to the chosen product rule.
- Do not automatically issue Stripe refunds.
- Do not silently mutate historical financial records.
- Audit policy changes.
- Preserve existing cancellation state protections.

## Verification

- Valid policy saves and is used by cancellation preview.
- Invalid percentages or overlapping tiers are rejected.
- Cross-tenant access fails.
- Existing cancellation protections remain intact.
- No automatic refund occurs.
- Relevant automated tests pass.
