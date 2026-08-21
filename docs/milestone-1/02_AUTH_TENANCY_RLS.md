# Phase 2 — Authentication, Tenancy and RLS

## Objective

Establish secure marina authentication and tenant isolation before creating operational data.

Berthio must never rely only on client-side filtering to separate marinas.

## Authentication Model

Marina accounts are invitation-only during the pilot.

Roles:
- `marina_admin`
- `marina_staff`

MVP login: email + password.

2FA is not required in Milestone 1.

Do not build full operator impersonation yet, but do not make an internal operator role impossible later.

## Core Entities

### `organizations`

Minimum fields:
- `id`
- `name`
- `created_at`

### `marinas`

Minimum fields:
- `id`
- `organization_id`
- `name`
- `slug`
- `timezone`
- `created_at`
- `updated_at`

Milestone 1: one organization has one marina. Architecture must still allow multiple marinas later.

### `organization_members`

Minimum fields:
- `id`
- `organization_id`
- `user_id`
- `role`
- `created_at`

Initial roles:
- `marina_admin`
- `marina_staff`

## Tenant Rules

A marina user may access only data belonging to organizations where they have membership.

Every future tenant-owned entity must be traceable to a marina and/or organization.

Do not use hidden UI elements as security.

## RLS

Enable Row Level Security.

Policies must ensure Marina A users cannot read, update, or create data for Marina B.

Test this explicitly.

## Route Protection

Public:
- `/`
- `/login`
- auth callback routes

Protected:
- `/dashboard/*`

Unauthenticated users visiting protected pages go to `/login`.

Do not globally redirect public pages to login.

## Admin vs Staff

Milestone 1:

Admin may access all marina operational data, configure berths, and create bookings.

Staff may view marina operational data and create/manage bookings.

More granular permissions come later.

## Seed/Test Data

Create at least two organizations/marinas during development:
- Marina A
- Marina B

Use them to verify RLS.

## Done When

- Marina user can sign in.
- Protected dashboard requires auth.
- User membership resolves server-side.
- Marina A can see Marina A.
- Marina A cannot see Marina B.
- RLS blocks cross-tenant reads/writes even with manipulated IDs.
- Admin and Staff roles resolve correctly.
