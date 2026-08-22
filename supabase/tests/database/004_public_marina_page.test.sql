begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.organizations (id, name)
values ('c0000000-0000-4000-8000-000000000003', 'Public profile test organization');

insert into public.marinas (
  id,
  organization_id,
  name,
  slug,
  timezone,
  is_public,
  public_description
)
values
  (
    'c1000000-0000-4000-8000-000000000003',
    'c0000000-0000-4000-8000-000000000003',
    'Published Marina',
    'published-marina',
    'Europe/Riga',
    true,
    'Safe public text'
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    'c0000000-0000-4000-8000-000000000003',
    'Private Marina',
    'private-marina',
    'Europe/Riga',
    false,
    'Must remain private'
  );

select ok(
  (select relrowsecurity from pg_class where oid = 'public.marinas'::regclass),
  'marinas retains RLS'
);
select has_column('public', 'marinas', 'is_public', 'marinas have a publication flag');
select has_column('public', 'marinas', 'primary_color', 'marinas support a primary color');
select has_column('public', 'marinas', 'public_description', 'marinas support public text');
select ok(
  has_column_privilege('anon', 'public.marinas', 'slug', 'select'),
  'anonymous users can select a public lookup column'
);
select ok(
  not has_column_privilege('anon', 'public.marinas', 'organization_id', 'select'),
  'anonymous users cannot select tenant ownership data'
);

set local role anon;

select results_eq(
  $$select name from public.marinas
    where slug in ('published-marina', 'private-marina')
    order by name$$,
  array['Published Marina'::text],
  'anonymous users see only published marinas'
);
select results_eq(
  $$select public_description from public.marinas where slug = 'published-marina'$$,
  array['Safe public text'::text],
  'anonymous users can read published profile text by slug'
);
select is(
  (select count(*) from public.marinas where slug = 'private-marina'),
  0::bigint,
  'unpublished marina slugs are not discoverable'
);
select throws_ok(
  $$select organization_id from public.marinas$$,
  '42501',
  null,
  'anonymous users cannot request organization ids'
);

select * from finish();
rollback;
