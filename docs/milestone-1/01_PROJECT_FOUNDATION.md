# Phase 1 — Project Foundation

## Objective

Create the clean technical foundation for Berthio before implementing marina business logic.

Do not build customer booking or payments in this phase.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Node.js
- Tailwind CSS
- shadcn/ui
- Supabase
- ESLint

Use a `src/` directory and `@/*` import alias.

## Suggested Structure

```text
src/
  app/
  components/
  domain/
  lib/
  types/
```

Prepare only the domain folders needed for this milestone:

```text
src/domain/
  berths/
  bookings/
  availability/
```

## Environment

Prepare for local, staging, and production. For now local development is enough, but the project must not assume only one environment will exist.

Environment variables must not be hard-coded. Server secrets must never be exposed to the browser.

## Required Work

- Initialize Next.js project.
- Enable TypeScript strict mode.
- Configure Tailwind.
- Add shadcn/ui.
- Add `@supabase/supabase-js` and `@supabase/ssr`.
- Configure environment variables.
- Establish browser/server Supabase clients using official SSR patterns.
- Add root layout.
- Add placeholder routes `/`, `/login`, `/dashboard`.
- Verify local development.

## Architecture Rule

Business logic must not live inside React UI components. React components display state and collect input. Marina business rules live in the domain layer.

## Do Not Build Yet

- Stripe
- Trigger.dev
- Postmark
- Bird SMS
- public marina booking
- marketplace
- pricing engine
- customer accounts
- promo codes
- refunds

## Done When

- App starts locally.
- TypeScript has no errors.
- Supabase client can connect.
- Server-side Supabase client works.
- `/` renders.
- `/login` renders.
- `/dashboard` exists as protected placeholder.
- Production build succeeds.
