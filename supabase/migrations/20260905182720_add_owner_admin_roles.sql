alter table public.user_roles drop constraint if exists user_roles_role_check;
update public.user_roles set role = 'owner' where role = 'admin';
alter table public.user_roles
  add constraint user_roles_role_check check (role in ('owner', 'admin'));

create or replace function private.is_platform_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'owner'
  );
$$;

create or replace function private.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role in ('owner', 'admin')
  );
$$;

revoke all on function private.is_platform_owner(uuid) from public, anon, authenticated;
revoke all on function private.is_platform_admin(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_platform_owner(uuid) to authenticated;
grant execute on function private.is_platform_admin(uuid) to authenticated;

grant select, insert, delete on public.user_roles to authenticated;

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own_or_owner
on public.user_roles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_platform_admin((select auth.uid())))
);

create policy user_roles_owner_insert_admin
on public.user_roles for insert to authenticated
with check (
  (select private.is_platform_owner((select auth.uid())))
  and role = 'admin'
  and user_id <> (select auth.uid())
);

create policy user_roles_owner_delete_admin
on public.user_roles for delete to authenticated
using (
  (select private.is_platform_owner((select auth.uid())))
  and role = 'admin'
  and user_id <> (select auth.uid())
);

drop policy if exists account_controls_read_own_or_admin on public.account_controls;
create policy account_controls_read_own_or_admin
on public.account_controls for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists account_controls_admin_update on public.account_controls;
create policy account_controls_admin_update
on public.account_controls for update to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
  and (
    not (select private.is_platform_owner(user_id))
    or (select private.is_platform_owner((select auth.uid())))
  )
)
with check (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
  and (
    not (select private.is_platform_owner(user_id))
    or (select private.is_platform_owner((select auth.uid())))
  )
);

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists marketing_consent_read_own_or_admin on public.marketing_consent_events;
create policy marketing_consent_read_own_or_admin
on public.marketing_consent_events for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read
on public.admin_audit_log for select to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists admin_audit_log_admin_insert on public.admin_audit_log;
create policy admin_audit_log_admin_insert
on public.admin_audit_log for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists team_claims_read_own_or_admin on public.team_claim_requests;
create policy team_claims_read_own_or_admin
on public.team_claim_requests for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists team_claims_admin_update on public.team_claim_requests;
create policy team_claims_admin_update
on public.team_claim_requests for update to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists team_memberships_read_own_or_admin on public.team_memberships;
create policy team_memberships_read_own_or_admin
on public.team_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

drop policy if exists team_memberships_admin_insert on public.team_memberships;
create policy team_memberships_admin_insert
on public.team_memberships for insert to authenticated
with check (
  exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  )
);

create or replace function public.review_team_claim(p_claim_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claim public.team_claim_requests;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('owner', 'admin')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.team_claim_requests
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_claim_id and status = 'pending'
  returning * into claim;

  if claim.id is null then raise exception 'Pending request not found'; end if;

  if p_decision = 'approved' then
    insert into public.team_memberships (team_id, user_id, role, verified_by)
    values (claim.team_id, claim.user_id, claim.requested_role, (select auth.uid()))
    on conflict (team_id, user_id) do update
      set role = excluded.role, verified_by = excluded.verified_by, verified_at = now();
  end if;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, details)
  values ((select auth.uid()), claim.user_id, 'team_claim_' || p_decision, jsonb_build_object('claim_id', claim.id, 'team_id', claim.team_id));
end;
$$;

revoke execute on function public.review_team_claim(uuid, text) from public, anon;
grant execute on function public.review_team_claim(uuid, text) to authenticated;
