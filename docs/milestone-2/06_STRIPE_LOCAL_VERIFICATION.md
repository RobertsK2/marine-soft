# Phase 6 local Stripe Connect verification

This runbook verifies the existing Phase 6 Checkout implementation only. It does not create a booking; a successful payment remains attached to its immutable payment snapshot and hold until Phase 7 is implemented.

## Secret handling

- Keep all local values in ignored `.env.local`. Never add real values to `.env.example`, source code, shell scripts, screenshots, issue text, or commits.
- Do not pass secret keys or webhook signing secrets as command-line arguments. The helpers never print configured values.
- Use only Stripe test-mode keys. A completed connected account remains the preferred path; localhost may use the guarded platform-account fallback below.

Required `.env.local` names:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
STRIPE_LOCAL_PLATFORM_FALLBACK=true
```

`STRIPE_LOCAL_PLATFORM_FALLBACK=true` is accepted only when Node is not in production, both the site and Supabase URLs are HTTP localhost/127.0.0.1, and `STRIPE_SECRET_KEY` is test mode. Otherwise startup fails closed. Non-local environments continue to require the connected-account direct-charge path.

The normal local Supabase variables must also be present. The verifier checks the secret key against Stripe, checks the publishable key's test-mode format, verifies the webhook secret with an offline signed payload, reads the marina configuration through the server-only Supabase client, and asks Accounts v2 whether the configured account has full Dashboard access, Stripe fee collection, Stripe negative balance liability, merchant configuration, and an active card-payments capability.

## One-time connected-account setup

Run the safe local helper. It accepts only a Stripe test-mode key and an HTTP localhost site URL. It creates or reuses a Marina A test connected account configured with full Stripe Dashboard access, Stripe fee collection, Stripe negative balance liability, and merchant card payments. It then prints the non-secret `acct_...` identifier and a fresh single-use Stripe-hosted onboarding URL:

```powershell
npm run stripe:setup-marina-a
```

The first run never changes Supabase. Complete the onboarding URL, then explicitly confirm the exact returned identifier:

```powershell
npm run stripe:setup-marina-a -- --confirm-account=acct_...
```

The confirmation run regenerates the onboarding link, verifies that card payments are active, requires the confirmed identifier to equal the account selected by the helper, and updates only local HTTP `localhost` or `127.0.0.1` Supabase. It refuses live-mode keys and non-local site or database URLs. If more than one tagged reusable account exists, select the intended test account explicitly with `--account=acct_...`.

The lower-level updater remains available for an already-onboarded test account:

```powershell
$env:BERTHIO_STRIPE_ACCOUNT_ID='acct_...'
npm run stripe:set-account -- --marina=marina-a
Remove-Item Env:BERTHIO_STRIPE_ACCOUNT_ID
```

The lower-level updater validates the account through Stripe before writing and refuses to update any Supabase URL other than local HTTP `localhost` or `127.0.0.1`.

## Connect webhook listener

The Stripe CLI is not currently installed on this workstation. Install the official npm-distributed CLI, then authenticate it:

```powershell
npm.cmd install --global @stripe/cli
stripe login
```

If it is already installed when you return to this runbook, skip the install command. Authentication is stored by the CLI; no Stripe API key needs to be pasted into the command.

Start the listener in a terminal; it forwards both platform and connected-account events to the same signature-verifying endpoint:

```powershell
npm run stripe:listen:connect
```

The Stripe CLI prints a new `whsec_...` signing secret. Copy it into `STRIPE_CONNECT_WEBHOOK_SECRET` in `.env.local`, start (or restart) `npm run dev`, and keep the listener running. Do not pipe listener output to a file.

Run the complete preflight:

```powershell
npm run stripe:verify -- --marina=marina-a
```

Every line must say `PASS`.

## One end-to-end test Checkout

1. Start local Supabase and reset it if the Phase 6 migration has not been applied. A reset restores the placeholder marker used by the guarded platform fallback. If testing a real connected account instead, rerun `stripe:set-account` after reset.
2. Start the app and Connect listener in separate terminals.
3. Open `http://localhost:3000/marina/marina-a`, enter valid future dates and vessel dimensions, check availability, and create the 15-minute hold.
4. Choose **Pay securely**, then complete Stripe Checkout with test card `4242 4242 4242 4242`, any future expiry, and any CVC/postcode.
5. After Stripe returns to Berthio, copy only the `cs_test_...` value from the `session_id` query parameter and verify the result:

```powershell
npm run stripe:verify-checkout -- --marina=marina-a --session=cs_test_...
```

The result verifier reads only the specified marina's payment, retrieves the Session from that marina's connected account, compares Stripe's amount/currency with the immutable server snapshot, and confirms webhook reconciliation on both the payment and hold. It intentionally does not create or expect a Phase 7 booking.
