# Phase 9 — Operational Notifications

## Objective
Add essential operational notifications without building a communication platform.

## Primary Channel
Email first. Prefer Postmark. SMS/Bird may be deferred unless required.

## Events
Booking confirmation if needed, upcoming arrival reminder, confirmed berth reassignment/move, cancellation confirmation, payment/balance reminder.

## Rules
- Send only after underlying state is committed.
- Prevent duplicate sends on retries.
- Log delivery result.
- Do not notify customer about berth outage before staff confirms resolution.

## Failure Handling
Record failure and allow retry; never roll back the booking operation because email failed.

## Done When
Critical operational emails can be sent and retried safely.
