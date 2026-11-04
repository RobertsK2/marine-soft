# Guest booking application origin

Stripe Checkout success/cancel URLs, signed guest management links (including
pay-at-marina redirects), and the public booking URL displayed in Publishing
all use `getSiteUrl()` from `src/lib/env.ts`.

Origin resolution uses server-owned environment values, never request Host or
forwarded-host headers:

- Vercel Preview/custom environments: `https://VERCEL_URL`, falling back to
  `https://VERCEL_BRANCH_URL`. `NEXT_PUBLIC_SITE_URL` and the production domain
  are deliberately ignored here. Missing valid deployment hosts fail closed.
- Vercel Production: a valid HTTPS `NEXT_PUBLIC_SITE_URL`, then
  `https://VERCEL_PROJECT_PRODUCTION_URL`, then `https://VERCEL_URL`.
  Localhost and other loopback destinations are rejected in all deployed cases.
- Local/non-Vercel: explicitly configure `NEXT_PUBLIC_SITE_URL`. HTTPS is
  required for a public origin. Loopback HTTP/HTTPS is allowed for local runs,
  including local production-build integration tests. There is no implicit
  localhost default.

Enable System Environment Variables in Vercel. Keep Preview and Production
configuration separate and keep `STRIPE_LOCAL_PLATFORM_FALLBACK=false` on Vercel.
No Stripe Connect account, webhook endpoint, payment reconciliation, guest token,
or database authorization settings need to change for this origin fix.

After approving and deploying this fix, use a **new booking attempt** to verify
both Stripe destinations on each target environment. Stripe Checkout sessions
already created retain their original success/cancel destinations; this change
does not replace or mutate existing sessions or payments. Do not repay a booking
that already succeeded. Use its existing confirmation email/management link or
ask the marina to recover the original booking.

The confirmation route is `/marina/[slug]/checkout/return?session_id=...`.
The session must belong to the public marina, and a paid confirmation requires
the webhook-recorded payment and active booking. Missing/invalid access shows
"Booking unavailable". Opening this route alone never verifies payment.
Vercel Deployment Protection can separately require SSO on deployment-specific
URLs; that is not guest booking authorization and must not be bypassed to test.
