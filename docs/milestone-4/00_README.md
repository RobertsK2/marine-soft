# Milestone 4 — Pilot Readiness

Goal: make Berthio ready for a controlled real-marina pilot without expanding into marketplace, native apps, or major UI redesign.

## Phases

1. Marina profile and timezone settings
2. Berth inventory setup and CSV import
3. Pricing, seasons, and mandatory fees configuration
4. Cancellation policy configuration
5. Stripe and Postmark integration status
6. Public booking page publish/unpublish controls
7. Pilot verification and readiness checklist

## Guardrails

- Preserve all Milestone 1–3 behavior.
- Keep tenant isolation and RLS strict.
- Do not redesign the UI; functional admin surfaces are sufficient.
- Do not add marketplace discovery, boater accounts, native apps, or unrelated analytics.
- Prefer server-side validation and auditable changes.
- Every phase must include relevant DB/RLS, unit, E2E, typecheck, lint, and build verification.
