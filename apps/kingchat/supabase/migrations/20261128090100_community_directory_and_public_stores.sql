-- Safe community member directory and public business storefront reads.
create or replace function public.kc_list_community_members(p_community_id uuid)
returns table(user_id uuid,role text,joined_at timestamptz,username text,display_name text,avatar_url text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.' using errcode = '28000'; end if;
  if not private.kc_is_community_member(p_community_id) then raise exception 'Join this community to view its members.' using errcode = '42501'; end if;
  return query select m.user_id,m.role,m.joined_at,p.username,p.display_name,p.avatar_url from public.kc_community_members m
  left join public.kc_profiles p on p.id=m.user_id where m.community_id=p_community_id
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,m.joined_at asc;
end; $$;
revoke all on function public.kc_list_community_members(uuid) from public, anon;
grant execute on function public.kc_list_community_members(uuid) to authenticated;
drop policy if exists kc_business_profiles_public_read on public.kc_business_profiles;
create policy kc_business_profiles_public_read on public.kc_business_profiles for select to authenticated using (true);
