# Berthio

Berthio is a Next.js 16 marina operations application. This repository is at
Milestone 1, Phase 2: invitation-only authentication, marina tenancy, and Row
Level Security. Berths, bookings, availability, and the marina map are deferred.

## Local setup

Prerequisites: Node.js 20.9 or newer and Docker Desktop or Podman.

1. Copy `.env.example` to `.env.local`.
2. Run `npm install`.
3. Run `npm run supabase:start` and copy its URL and publishable key into
   `.env.local`.
4. Run `npm run supabase:reset` to apply migrations and seed Marina A and B.
5. Run `npm run dev` and open `http://localhost:3000`.

Local signup is disabled. The seed creates two Phase 2 users with unknown
randomized passwords and matching memberships. Follow
`docs/milestone-1/02_DEVELOPMENT_TESTING.md` to set their passwords through
local Mailpit and test tenant isolation. Hosted pilot users still use the
Supabase admin invite flow; the invite email sends its token hash to
`/auth/confirm`, and the PKCE callback route is `/auth/callback`.

Use separate Supabase projects and environment configuration for local,
staging, and production. Add the exact callback URLs for each environment to
Supabase Auth URL Configuration. Never expose a secret or service-role key
through a `NEXT_PUBLIC_` variable.

## Verification

```text
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run test:e2e
npm run build
```

Database tests explicitly verify that Marina A cannot read, update, or insert
records for Marina B, and that admin and staff roles resolve independently.
Database and live-auth browser checks require the local Supabase stack.
