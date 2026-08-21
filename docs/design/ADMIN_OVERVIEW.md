# Berthio Admin Overview — UI & Data Specification

## Visual Reference 
Use this as the visual refernce 
`/public/mockups/admin-overview-reference.jpeg`

## Purpose

Define the Phase 7 admin Overview dashboard for Berthio.

The Overview must be a functional operational dashboard powered by real Supabase data.

This phase should prioritize correct data, useful operational visibility, and reuse of existing components over final visual polish.

Final UI fine-tuning will happen after Milestone 1.

---

## Visual Direction

Use the existing Berthio admin visual language:

- clean white cards
- subtle borders
- soft shadows
- rounded corners
- spacious layout
- clear hierarchy
- desktop-first
- responsive on tablet/mobile
- restrained visual styling
- no unnecessary charts or decorative widgets

The layout should feel operational and easy to scan.

---

## Main Dashboard Structure

The Overview contains three primary sections:

1. Quick Insights
2. Marina Map
3. Today's Activity

Suggested desktop structure:

```text
---------------------------------------------------------
Quick Insights
[ Arrivals ] [ Departures ] [ Occupancy ] [ Revenue* ]
---------------------------------------------------------

---------------------------------------------------------
Marina Map                          Today's Activity
[ existing Phase 6 map ]            [ activity feed ]
[                         ]          [               ]
[                         ]          [               ]
---------------------------------------------------------
```

On smaller screens, stack sections vertically.

---

## 1. Quick Insights

Create summary cards for the current marina.

### Arrivals Today

Show the number of bookings arriving today.

Use the marina's configured IANA timezone.

Do not use the browser timezone as business truth.

Only count relevant active bookings.

Cancelled bookings must not count as arrivals.

### Departures Today

Show the number of bookings departing today.

Use the marina's configured timezone.

Cancelled bookings must not count.

### Occupancy

Show a simple, documented operational occupancy value.

Use real berth and booking data.

For Milestone 1, prefer a clear calculation over a sophisticated one.

Example approach:

```text
active occupied/relevant bookings
÷
operational berth capacity
```

Do not fake advanced assignment-aware occupancy if specific berth assignment does not yet exist.

Document the chosen calculation in code.

### Revenue

Only show Revenue if the current system contains real booking amount/payment data that can support it correctly.

If Phase 7 does not yet have real revenue data:

- omit the card, or
- display it only as a clearly marked development placeholder

Never show fake production revenue.

Do not add Stripe or pricing architecture just to populate this card.

---

## 2. Marina Map

Reuse the existing Phase 6 marina map.

Do not rebuild or duplicate map logic.

The Overview should display the same real berth state from Supabase.

The map must continue to support:

- real berth records
- berth click/details
- operational status
- responsive SVG behavior
- tenant isolation

Do not start permanent berth assignment or booking-derived reserved/occupied states if they are not already supported.

---

## 3. Today's Activity

Create an operational activity panel for the current marina.

Use real data.

Relevant items may include:

- booking created
- booking cancelled
- arrival today
- departure today
- checked in
- checked out
- berth status changed

Do not invent activity.

If no formal activity/audit event table exists yet, use the simplest reliable source available.

Do not build a full event-sourcing system just for the dashboard.

---

## Activity Item Design

Each activity item should clearly show:

- event type
- booking reference or berth code when relevant
- customer/vessel context when available
- time
- optional short status label

Example:

```text
Arrival
Booking BTH-1042
Sea Breeze — Anna Smith
14:30
```

or:

```text
Berth status changed
Berth A-12
Available → Out of service
11:12
```

Keep items compact and scannable.

---

## Timezone Rules

All dashboard "today" calculations must use the marina's stored IANA timezone.

Examples:

- `Europe/Riga`
- `Europe/Berlin`

Database timestamps remain UTC.

The user's browser timezone must not determine marina operational dates.

---

## Empty States

Handle empty states intentionally.

Examples:

### No arrivals today

```text
No arrivals today
```

### No departures today

```text
No departures today
```

### No activity

```text
No activity yet today
```

### No berths

Show a clear setup/empty state instead of a broken map.

Do not render meaningless zero-state charts.

---

## Loading & Error States

Use clear loading states for:

- quick insights
- marina map
- activity feed

Use safe error states if Supabase requests fail.

Do not leave blank cards with no explanation.

---

## Suggested Components

```text
src/components/admin/overview/
  overview-dashboard.tsx
  quick-insights.tsx
  insight-card.tsx
  todays-activity.tsx
  activity-item.tsx
```

Reuse:

```text
src/components/admin/marina-map/
```

from Phase 6.

The exact structure may follow the current repository architecture.

---

## Data Flow

Suggested:

```text
server-side marina context
        ↓
tenant-scoped Supabase queries
        ↓
derived operational metrics
        ↓
Overview components
```

Do not fetch unrelated tenant data and filter it client-side.

---

## Security

Preserve all existing Phase 2–6 RLS behavior.

A Marina A user must never see Marina B:

- metrics
- bookings
- activity
- berths
- map data

Tenant safety applies to every dashboard query.

---

## Performance

The dashboard should be fast and simple.

Avoid:

- excessive client-side polling
- unnecessary charts
- large duplicated queries
- complex analytics infrastructure

Use efficient tenant-scoped queries.

Realtime is optional.

Do not introduce Realtime complexity if it risks the milestone.

---

## Responsive Behavior

Desktop is primary.

On desktop:

- Quick Insights in a horizontal row
- Marina Map as the main large panel
- Today's Activity alongside the map

On smaller screens:

- insight cards may wrap
- map becomes full-width
- activity stacks below

Do not create a completely separate mobile dashboard.

---

## UI Scope

Phase 7 includes:

- real Quick Insights
- real marina map reuse
- real Today's Activity
- loading states
- empty states
- responsive layout
- marina timezone-aware metrics

Phase 7 does not include:

- final visual polish
- Stripe
- payments
- public booking
- customer marketplace
- advanced analytics
- charting platform
- revenue forecasting
- permanent berth assignment
- new map architecture

---

## Important Implementation Rule

Functional correctness comes first.

Do not spend excessive time trying to match a pixel-perfect mockup during Phase 7.

The final Berthio UI polish pass will happen after Milestone 1 is complete.

---

## Phase 7 Done When

- Overview dashboard renders for authenticated marina users
- Arrivals Today uses real booking data
- Departures Today uses real booking data
- Occupancy uses a documented real calculation
- Revenue is not faked
- Phase 6 marina map is reused
- Today's Activity is populated from real operational data
- marina timezone is respected
- empty states work
- loading/error states are intentional
- tenant isolation remains enforced
- responsive layout works
- existing Phases 1–6 continue passing
