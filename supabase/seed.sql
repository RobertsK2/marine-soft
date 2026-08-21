-- Phase 2 local-only tenant fixtures.
--
-- Auth users and organization_members are intentionally not inserted with SQL.
-- Run `npm run test-users:setup` after `npm run supabase:reset`; the setup script
-- uses Supabase's local Admin Auth API and a password supplied at runtime.

insert into public.organizations (id, name)
values
  ('d0000000-0000-4000-8000-000000000001', 'Marina A Organization'),
  ('e0000000-0000-4000-8000-000000000002', 'Marina B Organization');

insert into public.marinas (id, organization_id, name, slug, timezone)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'Marina A',
    'marina-a',
    'Europe/Riga'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000002',
    'Marina B',
    'marina-b',
    'Europe/Riga'
  );
