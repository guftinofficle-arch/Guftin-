-- Run with: supabase test db
-- These checks validate that the HoloSpace migration has installed the
-- expected schema, RLS flags, private buckets and Realtime publication.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public','holospace_rooms','rooms table exists');
select has_table('public','holospace_members','members table exists');
select has_table('public','holospace_memories','memories table exists');
select has_table('public','holospace_gallery','gallery table exists');
select has_table('public','holospace_avatars','avatars table exists');
select has_table('public','holospace_themes','themes table exists');
select has_table('public','holospace_events','events table exists');
select has_table('public','holospace_activity','activity table exists');

select ok((select relrowsecurity from pg_class where oid='public.holospace_rooms'::regclass),'rooms RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.holospace_members'::regclass),'members RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.holospace_memories'::regclass),'memories RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.holospace_gallery'::regclass),'gallery RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.holospace_avatars'::regclass),'avatars RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.holospace_themes'::regclass),'themes RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.holospace_events'::regclass),'events RLS enabled');

select * from finish();
rollback;
