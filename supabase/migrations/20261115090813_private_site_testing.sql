-- Existing accounts retain access; new signups are not enrolled automatically.
create table private.site_access_settings (
 singleton boolean primary key default true check(singleton),
 restricted boolean not null default false
);
create table private.site_testers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enrolled_at timestamptz not null default now()
);
alter table private.site_access_settings enable row level security;
alter table private.site_testers enable row level security;
revoke all on private.site_access_settings,private.site_testers from public,anon,authenticated;
insert into private.site_access_settings(singleton,restricted) values(true,false);
insert into private.site_testers(user_id) select id from auth.users;

-- Only reports the calling account's access; never exposes the tester list.
create function public.get_site_access()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('restricted',s.restricted,'allowed',
   not s.restricted or exists(select 1 from private.site_testers t where t.user_id=(select auth.uid())))
 from private.site_access_settings s where s.singleton;
$$;
revoke all on function public.get_site_access() from public;
grant execute on function public.get_site_access() to anon,authenticated,service_role;

-- Gate the Data API as well as the website, including SECURITY DEFINER RPCs.
-- Auth endpoints remain available so enrolled users can sign in/reset passwords.
create function public.enforce_private_site()
returns void language plpgsql security definer set search_path='' as $$
begin
 if trim(both '/' from coalesce(current_setting('request.path',true),''))='rpc/get_site_access' then return; end if;
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role' then return; end if;
 if coalesce((public.get_site_access()->>'allowed')::boolean,false) then return; end if;
 raise sqlstate '42501' using message='PRIVATE_TESTING_ONLY';
end $$;
revoke all on function public.enforce_private_site() from public;
grant execute on function public.enforce_private_site() to anon,authenticated,service_role;

-- Do not overwrite another request hook if a future environment already has one.
do $$
begin
 if exists(select 1 from pg_roles r cross join lateral unnest(r.rolconfig) c
   where r.rolname='authenticator' and c like 'pgrst.db_pre_request=%') then
   raise exception 'Existing pre-request hook requires integration';
 end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.enforce_private_site';
notify pgrst,'reload config';
notify pgrst,'reload schema';
-- Activate only after the matching website code is deployed:
-- update private.site_access_settings set restricted=true where singleton;
-- Reopening is reversible: set restricted=false; the original RLS still applies.
