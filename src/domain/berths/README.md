# Berths domain

Phase 3 owns physical berth inventory only. Database rows are the operational
source of truth; map geometry, booking availability, and vessel matching remain
out of scope.

Priority uses a simple ascending convention: `1` is considered before `2`, and
so on. The current UI defaults new berths to `100`, leaving room to insert more
preferred berths without renumbering the full inventory.
