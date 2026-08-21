# Berthio — Milestone 1: Admin Core

## Goal

Build the first usable Berthio vertical slice:

> Marina staff can log in, open their marina, see physical berths, create a manual booking, have Berthio validate that the vessel can be accommodated, and see the booking reflected in marina operations and the SVG marina map.

This milestone is intentionally **admin-first**.

The public customer booking flow, Stripe payments, marketplace, SMS, promo codes, advanced pricing, and automation are **not part of Milestone 1**.

## V1 Distribution Model

Berthio V1 is not a marketplace.

Future customer flow:

`Marina website → Book a Berth → Berthio-hosted marina booking page`

Example: `berthio.com/marina/[slug]`

The marina brings the traffic. A Berthio-wide marina search marketplace is a later phase.

## Build Order

1. `01_PROJECT_FOUNDATION.md`
2. `02_AUTH_TENANCY_RLS.md`
3. `03_BERTHS_CORE.md`
4. `04_BOOKINGS_CORE.md`
5. `05_AVAILABILITY_MATCHING.md`
6. `06_SVG_MARINA_MAP.md`
7. `07_OVERVIEW_DASHBOARD.md`
8. `08_MILESTONE_VERIFICATION.md`

Do not jump ahead if a previous phase is not stable.

## Technical Direction

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase PostgreSQL/Auth/RLS
- Tailwind CSS
- shadcn/ui
- SVG marina map

No separate backend.

Do not add Express, NestJS, Python backend, Prisma, Drizzle, Redux, Firebase, or Clerk unless explicitly approved later.

## Completion Definition

Milestone 1 is complete when:

1. Marina Admin logs in.
2. Admin opens their marina dashboard.
3. Marina has at least 10 physical berths.
4. Admin creates a manual booking for a vessel.
5. Berthio validates vessel dimensions and date availability.
6. Invalid bookings are rejected clearly.
7. Valid booking is stored.
8. Booking appears in operational views.
9. SVG marina map reflects current berth state.
10. Marina A cannot access Marina B data.

Only after this works should development move to the public booking flow.
