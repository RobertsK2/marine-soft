# Phase 3 — Berths Core

## Objective

Represent the marina's real physical berth inventory in the database.

The database is the operational source of truth. The SVG map later visualizes these records.

## Entity: `berths`

Minimum fields:
- `id`
- `marina_id`
- `code` or `name`
- `zone`
- `max_length_m`
- `max_beam_m`
- `max_draft_m`
- `priority`
- `status`
- `allow_smaller_vessels`
- `created_at`
- `updated_at`

Milestone 1 statuses:
- `available`
- `blocked`
- `out_of_service`

Do not add every future berth status yet.

## Physical Suitability

A vessel fits a berth only when:
- vessel length <= berth max length
- vessel beam <= berth max beam
- vessel draft <= berth supported draft
- berth is operational
- marina rules allow its use

Pricing category must never override physical safety restrictions.

## Larger Berth Rule

A larger berth can hold a smaller vessel only when marina configuration permits it.

For Milestone 1, `allow_smaller_vessels` may be a boolean.

## Priority

Each berth has a priority used to decide which suitable berths should be considered first. Document the numeric convention and use it consistently.

## Admin Functionality

Build:
- list berths
- view berth details
- create berth
- edit berth
- set status
- set dimensions
- set priority

Do not build full SVG geometry editing.

## Initial Pilot Data

Create at least 10 realistic test berths with different dimensions. Ensure some vessels fit multiple berths.

## RLS

Berths are tenant-owned. A marina can only see and modify its own berths.

## Done When

- Authenticated marina user can see their berth list.
- Admin can add/edit berths.
- Status can be changed to blocked/out of service.
- Dimensions are validated.
- Marina A cannot access Marina B berths.
- At least 10 test berths exist.
