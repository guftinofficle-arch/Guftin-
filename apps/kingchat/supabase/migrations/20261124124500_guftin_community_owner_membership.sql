-- Automatically register a newly created community owner as the owner member.
-- This is needed for the community-membership RLS model to remain usable immediately.
create or replace function private.kc_add_community_owner_member()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.kc_community_members(community_id,user_id,role)
  values(new.id,new.owner_id,'owner')
  on conflict(community_id,user_id) do update set role='owner';
  return new;
end;
$$;
revoke all on function private.kc_add_community_owner_member() from public,anon,authenticated;
drop trigger if exists kc_community_owner_membership_after_insert on public.kc_communities;
create trigger kc_community_owner_membership_after_insert
after insert on public.kc_communities
for each row execute function private.kc_add_community_owner_member();
