# Berthio Marina Map — Design & Implementation Specification
## Visual reference


Use:

`/public/mockups/marina-map-reference.jpeg`

as the visual reference for layout, berth styling, legend placement, spacing, and overall marina-map presentation.

Do not embed the reference image into the final UI. Recreate the design with real SVG elements and live Supabase data.

## Purpose

Build an interactive marina map for the Berthio admin panel based on the provided visual reference.

The map is an operational tool for marina staff, not only a visual illustration.

It should allow staff to quickly understand:

* which berths are available
* which are reserved
* which are occupied
* which are unavailable
* where each berth is physically located
* basic berth and booking details

---

## Visual Reference

The marina map should follow the visual structure of the provided mockup:

* large central marina map
* light water/background area
* dock/pontoon geometry
* individual berth/vessel shapes positioned around the docks
* berth number displayed inside each berth shape
* clear color-coded status system
* compact legend above the map
* marina/zone selector in the top-right
* optional services panel
* clean white card layout consistent with the Berthio admin UI

Do not embed the screenshot itself into the product.

Recreate the layout using real application components and live data.

---

## Map Layout

The map should be displayed inside a reusable admin card.

Suggested structure:

```text
Berth Overview                         [View: Marina A ▼]

● Available
● Reserved
● Occupied
● Unavailable

----------------------------------------------------

                    MARINA SVG MAP

              docks + berth shapes + labels

----------------------------------------------------
```

The map should scale responsively while preserving berth positions.

---

## SVG Architecture

Use SVG as the marina layout format.

Each physical berth must be represented by an interactive SVG element with a stable identifier.

Example:

```xml
<g data-berth-id="UUID">
  ...
</g>
```

Prefer the database berth UUID as the stable identifier.

If an imported SVG initially uses berth codes such as `01`, `02`, `A12`, etc., create an explicit mapping to the corresponding database `berth_id`.

Do not identify berths only by coordinates or visible text.

---

## Source of Truth

The SVG defines only:

* berth geometry
* berth position
* dock geometry
* labels
* visual layout

The SVG must **not** be the source of truth for operational state.

Supabase is the source of truth.

Operational display state should be derived from:

```text
berth
+
current bookings
+
booking status
+
operational berth status
```

---

## Physical Berth Status

The existing berth database status remains:

* `available`
* `blocked`
* `out_of_service`

Do not replace these database statuses with visual map statuses.

---

## Map Display Status

The map may display the following derived states:

### Available — Green

Use when:

* berth is operational
* berth is not currently reserved/occupied by relevant booking state

### Reserved — Yellow

Use when:

* berth/capacity is associated with an upcoming or relevant confirmed reservation for the selected operational period

### Occupied — Red

Use when:

* vessel is currently checked in / occupying the berth

### Unavailable — Gray

Use when berth is:

* `blocked`
* `out_of_service`

The exact future relationship between booking assignment and map reservation state may evolve when berth assignment is implemented.

Do not persist `reserved` or `occupied` as physical berth status values merely for the map.

---

## Important Phase 6 Limitation

Phase 6 must not introduce permanent berth assignment if that functionality does not already exist.

If booking-to-specific-berth assignment is not yet implemented, do not fake it.

For Phase 6, the map should primarily represent physical berth inventory and operational berth state.

Reserved/occupied booking-derived states should only be shown when supported by real existing data.

---

## Berth Interaction

Every berth should be clickable.

On click, open a side panel, popover, or drawer with berth information.

Minimum information:

```text
Berth 05

Status
Available

Zone
A

Max length
12 m

Max beam
4.0 m

Max draft
2.5 m

Priority
2

Smaller vessels allowed
Yes
```

If real booking/assignment data exists, the panel may additionally show the relevant vessel or booking.

Do not invent booking data for visual purposes.

---

## Berth Status Editing

Authorized marina users should be able to change operational berth status from the berth detail UI.

Support:

* available
* blocked
* out_of_service

Changes must:

1. update Supabase
2. respect RLS
3. update the map state
4. remain correct after page refresh

---

## Legend

Display a compact legend similar to the reference:

```text
● Available
● Reserved
● Occupied
● Unavailable
```

Only display states that are genuinely supported by the current implementation.

If Phase 6 only supports physical berth states initially, adapt the legend accordingly rather than creating fake states.

---

## Marina / Zone Selector

The reference contains a selector such as:

```text
View: Marina A
```

Prepare the UI so the map can eventually support:

* different marina areas
* docks
* zones
* multiple maps

For Milestone 1, one marina/map view is enough.

Do not build a complex multi-map management system.

---

## Services Panel

The visual reference includes a small services card showing items such as:

* Electricity
* Water
* Wi-Fi

This is visually optional in Phase 6.

Do not add new service-management database architecture only to reproduce this panel.

If service data does not exist yet, omit the panel.

---

## Suggested Components

```text
src/components/admin/marina-map/
  marina-map.tsx
  marina-svg.tsx
  berth-shape.tsx
  berth-details-panel.tsx
  map-legend.tsx
  map-status.ts
```

The exact structure may follow the existing project architecture.

---

## Suggested Data Flow

```text
Supabase
   ↓
marina berths
   ↓
relevant operational / booking data
   ↓
deriveMapDisplayState()
   ↓
MarinaMap
   ↓
BerthShape
   ↓
SVG visual state
```

Do not place status derivation logic directly inside large React components.

---

## Styling

Follow the current Berthio admin visual language:

* white cards
* subtle borders
* soft shadows
* rounded corners
* clean typography
* spacious layout
* light marina/water background
* clear status colors
* readable berth numbers

Avoid excessive visual effects.

The map should feel operational and professional.

---

## Responsive Behavior

Desktop is the primary admin experience.

The map should:

* scale down without breaking geometry
* preserve berth label readability
* support horizontal/contained layout if necessary
* keep details accessible on smaller screens

Do not rebuild the marina geometry differently for mobile.

---

## Accessibility

Do not communicate berth status using color alone.

Each interactive berth should expose:

* berth name/code
* status
* accessible label or title

Keyboard interaction should be supported where practical.

---

## Editing Scope

Phase 6 includes:

* rendering marina SVG
* mapping SVG berth elements to DB berth records
* deriving supported display state
* clicking berths
* displaying berth details
* updating operational berth status

Phase 6 does **not** include:

* self-service SVG geometry editor
* drag-and-drop berth placement
* automatic map generation
* permanent booking-to-berth assignment
* public/customer marina map
* pricing
* payments
* advanced berth optimization

---

## Pilot Onboarding Model

For early pilot marinas:

1. Berthio receives marina plan/image.
2. Berthio manually prepares the SVG layout.
3. Each berth shape is mapped to a real database berth.
4. Marina staff can edit berth data/status.
5. Marina staff cannot edit map geometry.

A self-service geometry editor can be considered later.

---

## Phase 6 Done When

* marina SVG renders correctly
* at least 10 real berth records are represented
* each berth has a stable `berth_id`
* map state comes from Supabase
* berth number/code is visible
* berth click opens correct details
* operational status can be changed
* map updates after status change
* state remains correct after refresh
* RLS remains enforced
* no fake booking assignment is introduced
* no map geometry editor is built
* existing Phases 1–5 continue passing
