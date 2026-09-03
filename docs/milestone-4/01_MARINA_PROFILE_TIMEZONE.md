# Phase 1 — Marina Profile and Timezone

## Goal

Allow marina admins to safely configure core marina identity and operational timezone data.

## Requirements

- Admin-only tenant-safe edit flow.
- Marina name and public-facing contact/details.
- Address/location fields where already supported by the schema.
- IANA timezone selection and validation.
- Existing bookings and timestamps remain stored in UTC.
- Operational displays may use the configured marina timezone.
- Reject invalid or unsupported timezone values.
- Preserve existing tenant isolation and RLS.
- Record meaningful changes in the existing audit log.
- No UI redesign; functional settings UI is enough.

## Out of Scope

- Berth import
- Pricing configuration
- Cancellation policy configuration
- Stripe/Postmark setup
- Public page publishing

## Verification

- Admin can edit own marina profile.
- Staff cannot perform admin-only changes if current role rules prohibit it.
- Cross-tenant update attempts fail.
- Valid IANA timezone saves successfully.
- Invalid timezone is rejected server-side.
- Existing bookings are not mutated by timezone changes.
- Audit events capture before/after context.
- Relevant automated tests pass.
