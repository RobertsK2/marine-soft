# Phase 2 Development Test Setup

This setup is local-only. It creates two isolated marina tenants and one active
Supabase Auth admin in each tenant. It does not create berths, bookings, or any
Phase 3 data.

## Test accounts

| Email | Organization | Marina | Role |
| --- | --- | --- | --- |
| `admin-a@berthio.test` | Marina A Organization | Marina A | `marina_admin` |
| `admin-b@berthio.test` | Marina B Organization | Marina B | `marina_admin` |

No password or Supabase secret is stored in the repository. The local setup
script creates users through Supabase's Admin Auth API and receives its admin
key at runtime from `supabase status`.

## Start and seed the local stack

1. Start Docker Desktop or Podman.
2. Run `npm run supabase:start`.
3. Put the local API URL and publishable key printed by the CLI in `.env.local`.
4. Confirm `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `.env.local`.
5. Run `npm run supabase:reset`.
6. In PowerShell, set a local-only password and create the Auth users:

   ```powershell
   $env:BERTHIO_LOCAL_TEST_PASSWORD = '<choose-at-least-12-characters>'
   npm run test-users:setup
   ```

7. Run `npm run dev`.

The database reset creates the two organizations and marinas. The setup command
creates or updates exactly one confirmed Auth user and one active admin
membership for each fixture tenant, then signs in as both users and verifies
that RLS exposes only the expected tenant.

## Development passwords

The runtime value of `BERTHIO_LOCAL_TEST_PASSWORD` becomes the password for
both local test accounts. Keep it local, do not reuse it, and do not place it in
`seed.sql`, `.env.example`, documentation, or a commit. Re-run
`npm run test-users:setup` whenever you want to rotate it or after every
`npm run supabase:reset`.

## Verify password recovery with Mailpit

1. Keep the app running at `http://localhost:3000`.
2. Open `http://localhost:3000/forgot-password`.
3. Submit either test email.
4. Open `http://localhost:54324` and select the newest recovery message.
5. Follow its link. It must pass through `/auth/callback` and finish at
   `http://localhost:3000/reset-password`.
6. Set a new password of at least eight characters and log in with it.

Supabase intentionally returns a successful reset response for unknown email
addresses but does not send a message. Use one of the exact test addresses.

## Reset one checked-in local test booking

This is a local recovery utility for repeating check-in tests. It does not add
an API endpoint or change any production migration, trigger, or transition.

List explicit candidates, then reset exactly one by reference or UUID:

```powershell
npm run booking:reset-local -- --list
npm run booking:reset-local -- BK-ABC1234567
```

The command refuses non-HTTP/non-local Supabase URLs. Inside one locked
transaction it verifies that the booking is currently `checked_in`, temporarily
disables only the operational-transition trigger, clears the local check-in
timestamp and exception fields, restores `confirmed`, and re-enables the trigger
before commit. Any error rolls back the trigger change and booking update.

## Manual tenant-isolation check

1. Log in as `admin-a@berthio.test` and confirm the dashboard shows `Marina A
   Organization`, `Marina A`, and `MARINA ADMIN`.
2. Log out completely.
3. Log in as `admin-b@berthio.test` and confirm the dashboard shows `Marina B
   Organization`, `Marina B`, and `MARINA ADMIN`.
4. Confirm neither session displays the other marina.
5. Run `npm run test:db` for manipulated-ID read/write coverage enforced by
   PostgreSQL RLS.

Both admin accounts can update only their own tenant under the Phase 2 policies.
