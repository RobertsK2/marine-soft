# Phase 1 — Public Marina Page

## Objective

Create the public hosted marina page at:

`/marina/[slug]`

This page is the booking entry point linked from the marina's own website.

## Requirements

Show real marina data:

- marina name
- branding/logo if available
- cover image if available
- short description
- local timezone context
- booking CTA/form entry
- public marina map preview if available

Do not expose admin controls.

Public reads must remain safe and tenant-scoped.

## Branding

Support basic per-marina branding:

- logo
- cover image
- primary color
- short public text

Keep schema simple.

## Localization

Public page should be structured for:

- English
- marina local language

Browser language auto-detection may be prepared, but do not overbuild translation management.

## Out of Scope

- marketplace
- search across marinas
- reviews
- customer accounts
- payments
- availability calculation

## Done When

A public user can open a marina by slug and see a polished, real-data booking entry page.
