# Phase 3 — Public Availability

## Objective

Connect the public booking form to the Milestone 1 physical-berth availability engine.

## Rules

- reuse the existing availability domain
- do not create a second matching engine
- server-side result is authoritative
- public users must not access raw tenant data
- return only booking-safe availability output

## Result

At minimum return:

- available
- unavailable because vessel fits no berth
- unavailable because suitable capacity is full

Do not expose internal berth assignments.

## Security

Public availability must be scoped to the marina slug/id resolved server-side.

Do not trust marina IDs supplied by the browser without validation.

## Done When

A guest can submit dates + vessel dimensions and receive the correct real availability result.
