-- Publication readiness is enforced only by the service-only mutation added in
-- Phase 6. Remove the legacy direct column grant from the original public-page
-- profile migration so authenticated admins cannot bypass those checks through
-- the Data API. Existing profile/media grants and tenant RLS remain unchanged.
revoke update (is_public) on public.marinas from authenticated;
