# Marina map domain

Phase 6 treats Supabase berth rows as operational truth and the SVG as a
Berthio-managed visualization. `pilot-layout.ts` contains geometry only, with
each placement keyed by the stable `berths.id` UUID. It deliberately contains
no status, dimensions, or booking assignment data.

Until permanent booking-to-berth assignment exists, `available` is displayed
as available and both `blocked` and `out_of_service` are displayed as
unavailable. The exact physical status remains visible in berth details.
