-- Enforce blocks symmetrically without exposing another user's block list.
create or replace function public.kc_is_user_blocked(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.kc_user_blocks b
    where
      (b.blocker_id = (select auth.uid()) and b.blocked_user_id = p_other_user_id)
      or
      (b.blocker_id = p_other_user_id and b.blocked_user_id = (select auth.uid()))
  );
$$;
revoke all on function public.kc_is_user_blocked(uuid) from public;
grant execute on function public.kc_is_user_blocked(uuid) to authenticated;
