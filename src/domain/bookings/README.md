# Bookings domain

Phase 4 owns manual booking snapshots, stay interval validation, booking status,
and tenant-scoped persistence.

Bookings guarantee suitable marina capacity rather than permanently reserving a
specific berth. Customer and vessel details are copied into the booking so later
profile changes cannot rewrite history.

Stay dates use `[arrival, departure)` semantics. Phase 4 performs only a basic
physical-capacity precheck through `validateBookingCapacity`. Date-conflict
availability, berth ranking, and berth assignment remain Phase 5 concerns.
