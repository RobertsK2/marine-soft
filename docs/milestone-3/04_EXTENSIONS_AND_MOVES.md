# Phase 4 — Extensions and Berth Moves

## Objective
Support stay extensions and controlled berth moves.

## Extension Flow
Validate new departure, rerun availability, validate current berth for the extended stay, calculate price difference, and show result before confirmation.

## Berth Move
If the current berth cannot serve the extension:
- allow a planned move to another suitable berth
- show move before confirmation
- never move silently
- preserve move history

Multiple assignments are allowed only for extensions or explicit operational exceptions.

## Tests
Same-berth extension, move-required extension, impossible extension, price increase, assignment conflicts, move history, tenant isolation.

## Done When
Staff can extend stays and schedule a controlled berth move when required.
