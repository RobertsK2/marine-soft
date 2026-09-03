# Phase 5 — Stripe and Postmark Integration Status

## Goal

Give marina admins and operators a clear operational view of whether critical external integrations are ready for pilot use.

## Requirements

- Show Stripe readiness status without exposing secrets.
- Show Postmark/email delivery readiness without exposing credentials.
- Distinguish local-development fallback from production-ready configuration where applicable.
- Surface actionable missing-configuration states.
- Add server-side health/status checks where safe.
- Preserve production Stripe Connect architecture.
- Preserve notification worker/outbox behavior.
- Do not log or return secret values.
- Do not add automatic account onboarding beyond existing architecture unless explicitly required.

## Verification

- Missing Stripe configuration is reported safely.
- Configured Stripe state is detected correctly.
- Missing Postmark configuration is reported safely.
- Worker endpoint protection remains intact.
- No secret values appear in browser responses/logs/tests.
- Relevant automated tests pass.
