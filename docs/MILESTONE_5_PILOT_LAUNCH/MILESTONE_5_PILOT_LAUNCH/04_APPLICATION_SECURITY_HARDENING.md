# M5.4 — Application Security Hardening

## Goal

Close the remaining internet-facing security gaps before exposing a pilot marina and real guests to production traffic.

This phase should preserve existing tenant/RLS, hold quotas, availability rules, Stripe signatures, and booking concurrency protections.

## Workstream 1 — Security headers

### Required review

Inspect the actual production response headers for public, auth, and dashboard routes.

Evaluate and deliberately configure, as applicable:

- Content-Security-Policy;
- Strict-Transport-Security in HTTPS production;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- frame embedding protection via CSP `frame-ancestors` or equivalent;
- other headers required by the chosen Next.js/Vercel architecture.

### CSP caution

Do not deploy an untested CSP that silently breaks:

- Stripe redirects/resources;
- Supabase auth/network requests;
- Sentry;
- PostHog if enabled;
- Next.js assets;
- fonts/images required by the product.

Start from observed network/resource needs and test in staging.

## Workstream 2 — Admin MFA policy

### Goal

A marina admin account can change pricing, publishing, berth configuration, payment settings, and other operational data. Pilot access therefore deserves stronger protection than password-only assumptions.

### Steps

1. Inspect current Supabase MFA support and current auth implementation.
2. Decide the pilot policy:
   - preferred: require MFA for marina admins;
   - acceptable temporary fallback only if implementation cannot safely be completed before pilot: documented mandatory operational policy with evidence and a scheduled engineering follow-up.
3. Ensure enrollment/recovery UX is understandable.
4. Ensure staff/admin authorization cannot be bypassed by manipulating client state.
5. Test login/session refresh and protected server actions after MFA changes.

Do not build custom cryptography or custom TOTP storage if Supabase provides the required primitives.

## Workstream 3 — Public availability abuse protection

### Context

The booking hold path already contains protections because holds consume scarce capacity. The public availability endpoint should also be reviewed for abuse because it can trigger repeated database/solver work even when no hold is created.

### Threats

- scripted high-frequency searches;
- resource exhaustion through wide date/dimension combinations;
- tenant enumeration;
- using availability as a free expensive computation endpoint;
- bypassing client-side debounce by calling the endpoint directly.

### Controls

Use the smallest effective server-side protection compatible with the architecture:

- per-IP/network/requester rate limit;
- bounded date ranges and input sizes;
- existing solver bounds;
- inexpensive validation before database-heavy work;
- generic errors that do not leak internal tenant/security details;
- monitoring of repeated failures/429s.

Do not rely solely on a disabled button or browser debounce.

## Workstream 4 — Re-run tenant and secret protections

Verify:

- anonymous user cannot access admin data;
- staff cannot perform admin-only actions;
- marina A cannot read/write marina B data;
- public guest tokens cannot cross tenant boundaries;
- provider secrets do not reach browser bundles;
- logs do not print webhook secrets, signing secrets, Supabase secret keys, or raw sensitive payloads;
- `npm run verify:secrets` remains green.

## Workstream 5 — Supabase security review

Before pilot:

- run schema lint;
- run security advisor;
- review RLS coverage;
- review `SECURITY DEFINER` functions and explicit search paths;
- inspect public RPC grants;
- inspect storage bucket policies if storage is used;
- inspect auth redirect origins for staging vs production.

Do not dismiss advisor findings merely because the app UI hides the underlying table/function.

## Exit criteria

- [ ] production/staging security headers are deliberate and tested;
- [ ] CSP does not break required providers;
- [ ] admin MFA policy is implemented or explicitly documented as a temporary controlled-pilot exception;
- [ ] public availability endpoint has appropriate server-side abuse protection;
- [ ] existing hold abuse protections still pass;
- [ ] cross-tenant tests pass;
- [ ] role authorization tests pass;
- [ ] secrets scan passes;
- [ ] Supabase lint/security advisor has no unresolved critical/high security issue.
