# Availability domain

Phase 5 answers whether a requested vessel can occupy one suitable physical
berth for its complete stay while all overlapping active bookings can also be
assigned to distinct suitable berths.

`checkAvailability` is pure and deterministic. It uses real berth dimensions,
operational state, the smaller-vessel rule, and `[arrival, departure)` booking
intervals. It assigns the most constrained vessels first and tries the smallest
suitable berth, using lower marina priority and then code/id as tie-breakers.

Assignments are calculation results only. Phase 5 does not persist a berth on a
booking, create holds, calculate price, or add the Phase 6 SVG map.
