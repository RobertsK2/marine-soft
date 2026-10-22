-- The Supabase dashboard auto-RLS template installs this event-trigger function
-- outside the application migration chain. API roles never call it directly.
-- Keep the event trigger active while removing PostgREST-exposed execution.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
