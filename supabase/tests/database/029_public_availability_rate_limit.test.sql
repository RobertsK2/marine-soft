begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select ok((select relrowsecurity from pg_class where oid='public.public_availability_rate_limits'::regclass), 'rate limit table has RLS');
select ok(not has_table_privilege('anon', 'public.public_availability_rate_limits', 'select'), 'anonymous users cannot inspect counters');
select ok(not has_table_privilege('authenticated', 'public.public_availability_rate_limits', 'insert'), 'authenticated users cannot write counters');
select ok(not has_function_privilege('anon', 'public.allow_public_availability_check(text,text)', 'execute'), 'anonymous users cannot call rate limit RPC');
select ok(not has_function_privilege('authenticated', 'public.allow_public_availability_check(text,text)', 'execute'), 'authenticated users cannot call rate limit RPC');
select ok(has_function_privilege('service_role', 'public.allow_public_availability_check(text,text)', 'execute'), 'server-only role can call rate limit RPC');

select is((select count(*)::integer from generate_series(1,20) where public.allow_public_availability_check(repeat('a',64),repeat('b',64))),20,'first 20 checks from a session are allowed');
select is(public.allow_public_availability_check(repeat('a',64),repeat('b',64)),false,'session limit rejects the next check');
select is((select count(*)::integer from generate_series(1,100) as attempts(n)
  where public.allow_public_availability_check(lpad(to_hex(attempts.n),64,'0'),repeat('b',64))),99,'network limit remains effective after session rotation');

select * from finish();
rollback;
