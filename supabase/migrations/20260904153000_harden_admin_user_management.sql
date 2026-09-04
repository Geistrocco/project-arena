drop policy if exists users_can_read_own_profile on public.profiles;
drop policy if exists profiles_admin_read_all on public.profiles;

create policy profiles_read_own_or_admin
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  )
);

create index if not exists account_controls_updated_by_idx
  on public.account_controls (updated_by);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_user_id);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_user_id);

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

