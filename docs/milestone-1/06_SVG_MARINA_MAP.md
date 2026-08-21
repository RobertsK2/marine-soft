# Phase 6 — SVG Marina Map

## Objective

Connect the marina's visual map to real berth records.

The database is the source of truth. The SVG is the visualization.

## Map Model

Each physical berth in the SVG must map to a stable `berth_id`.

Conceptually:

```html
<g data-berth-id="...">
```

Do not use labels or coordinates as the database identity.

## MVP Map Behavior

Show berth state:
- available
- blocked
- out of service

Later phases add held/assigned/occupied.

## Interaction

Clicking a berth opens details showing at least:
- berth code
- dimensions
- zone
- priority
- status

Admin may update allowed Milestone 1 properties.

## Map Editing

Do not build a self-service geometry editor.

For pilot:
- Berthio creates/configures SVG.
- Marina edits berth data, not geometry.

## Styling

Visual state derives from database data. Do not hard-code operational truth into SVG fills.

The same berth record drives list view, detail view, and map state.

## Realtime

If straightforward with Supabase Realtime, berth state may update without refresh. Do not let Realtime complexity block the milestone.

## Accessibility

Do not communicate state using color alone. Use tooltip/text/status labels where practical.

## Done When

- Pilot SVG renders.
- At least 10 database berths are mapped.
- Each SVG berth uses stable `berth_id`.
- Clicking berth opens correct details.
- Status updates persist.
- Map reflects database state.
- No geometry editor exists.
