# Phase 7 — Overview Dashboard

## Objective

Populate the approved Berthio Overview design using real data from previous phases.

Do not build the dashboard before bookings and berths work.

The dashboard is a view over operational truth, not the source of truth.

## Existing Visual Direction

Overview contains:
- Quick Insights
- Marina Map
- Today's Activity

Use the approved Berthio visual language. Do not redesign the admin information architecture here.

## Quick Insights

### Arrivals Today
Count bookings whose arrival date is today in marina-local time.

### Departures Today
Count bookings whose departure date is today in marina-local time.

### Occupancy
Use a documented simple calculation based on active confirmed stays relative to operational berth capacity.

Do not pretend advanced dynamic assignment metrics exist yet.

### Revenue
If payment data is not implemented, omit revenue or clearly mark development-only placeholders. Never show fake revenue as real.

## Marina Map

Use the operational SVG map from Phase 6.

## Today's Activity

Show real operational events/data such as:
- arrival today
- departure today
- booking created
- booking cancelled
- check-in
- check-out
- berth status changed

Do not build event sourcing solely for the dashboard.

## Marina Timezone

"Today" means today in the marina's configured IANA timezone. Database timestamps remain UTC.

## Empty States

Handle no bookings, no berths, no activity, no arrivals/departures intentionally.

## Done When

- Dashboard uses real Supabase data.
- Quick Insights use real records.
- Marina map is driven by berth data.
- Today's Activity reflects real operations.
- Marina timezone is respected.
- No fake production metrics are shown.
