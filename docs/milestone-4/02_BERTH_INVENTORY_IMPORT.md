# Phase 2 — Berth Inventory Setup and CSV Import

## Goal

Make it practical to onboard a real marina with dozens or hundreds of berths without manual entry one-by-one.

## Requirements

- Preserve existing berth create/edit behavior.
- Add a tenant-safe admin CSV import flow.
- Provide a preview before committing changes.
- Validate required berth fields and dimensions.
- Detect duplicate berth identifiers/names within the same marina.
- Reject cross-tenant identifiers and unsafe references.
- Support row-level error reporting.
- Failed rows must not silently create partial invalid data.
- Prefer atomic import where practical; otherwise clearly report committed vs failed rows.
- Do not auto-delete existing berths.
- Preserve stable berth IDs for existing records.
- Audit successful bulk changes.

## Suggested CSV Fields

- berth_name / berth_code
- max_length_m
- max_beam_m
- max_draft_m
- status
- optional notes/category fields already supported by schema

## Verification

- Valid CSV preview matches intended writes.
- Valid import creates only Marina A berths for Marina A.
- Invalid dimensions/status values are rejected.
- Duplicate rows are detected.
- Cross-tenant references fail.
- Existing berth assignments/bookings are preserved.
- Relevant automated tests pass.
