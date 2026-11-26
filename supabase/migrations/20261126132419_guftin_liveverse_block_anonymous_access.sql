-- Prevent anonymous Auth identities from accessing Liveverse data.
-- This is restrictive, so it ANDs with the existing membership/owner policies.
create or replace function private.liveverse_is_non_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true';
$$;

revoke all on function private.liveverse_is_non_anonymous() from public, anon;
grant execute on function private.liveverse_is_non_anonymous() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'liveverse_spaces',
    'liveverse_members',
    'liveverse_notes',
    'liveverse_tasks',
    'liveverse_canvas',
    'liveverse_media',
    'liveverse_events'
  ] loop
    execute format('drop policy if exists liveverse_non_anonymous_access on public.%I', table_name);
    execute format(
      'create policy liveverse_non_anonymous_access on public.%I as restrictive for all to authenticated using ((select private.liveverse_is_non_anonymous())) with check ((select private.liveverse_is_non_anonymous()))',
      table_name
    );
  end loop;
end $$;

drop policy if exists liveverse_storage_non_anonymous_access on storage.objects;
create policy liveverse_storage_non_anonymous_access on storage.objects
as restrictive for all to authenticated
using (
  bucket_id <> 'liveverse-media'
  or (select private.liveverse_is_non_anonymous())
)
with check (
  bucket_id <> 'liveverse-media'
  or (select private.liveverse_is_non_anonymous())
);
