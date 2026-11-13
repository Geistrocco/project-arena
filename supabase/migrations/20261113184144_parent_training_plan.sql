create function public.get_my_training_plan(p_week date)
returns table(nomination_id uuid,player_id uuid,player_name text,team_name text,title text,starts_at timestamptz,location text,response text,release_at timestamptz,can_respond boolean,version text,changed boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'Invalid week'; end if;
 return query select n.id,p.id,p.full_name,t.name,n.title,n.starts_at,n.location,np.response,
 private.training_team_release_at(n),n.status='open' and n.starts_at>now() and private.training_team_release_at(n)<=now(),
 md5(private.training_notification_version(n)||np.response||coalesce(np.responded_at::text,'')),
 exists(select 1 from public.training_notifications a where a.user_id=auth.uid() and a.nomination_id=n.id and a.kind='changed' and a.version=private.training_notification_version(n))
 from public.team_nominations n join public.team_nomination_players np on np.nomination_id=n.id
 join public.player_profiles p on p.id=np.player_id join public.club_teams t on t.id=n.team_id
 where n.event_type='training' and n.status<>'cancelled'
 and n.starts_at>=p_week::timestamp at time zone 'Europe/Bratislava'
 and n.starts_at<(p_week+7)::timestamp at time zone 'Europe/Bratislava'
 and exists(select 1 from public.player_guardians pg where pg.player_id=p.id and pg.guardian_user_id=auth.uid())
 and exists(select 1 from public.team_players tp where tp.team_id=n.team_id and tp.player_id=p.id and tp.status='active')
 order by p.full_name,p.id,n.starts_at,n.id;
end $$;

create function public.respond_to_training_plan(p_items jsonb,p_response text,p_reason text default null,p_pending_only boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; n public.team_nominations; np public.team_nomination_players; total integer:=0;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid selection'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 or p_response is null or p_response not in ('accepted','declined') or p_pending_only is null then raise exception 'Invalid selection'; end if;
 if p_pending_only and p_response<>'accepted' then raise exception 'Invalid bulk response'; end if;
 if p_response='declined' and char_length(trim(coalesce(p_reason,''))) not between 2 and 500 then raise exception 'Decline reason required'; end if;
 -- Lock events and responses in stable order, shared with schedule edits and other parents.
 for item in select value from jsonb_array_elements(p_items) order by value->>'nomination_id',value->>'player_id' loop
  select * into n from public.team_nominations where id=(item->>'nomination_id')::uuid for update;
  if n.id is null or n.event_type<>'training' or not exists(select 1 from public.player_guardians pg where pg.player_id=(item->>'player_id')::uuid and pg.guardian_user_id=auth.uid())
   or not exists(select 1 from public.team_players tp where tp.team_id=n.team_id and tp.player_id=(item->>'player_id')::uuid and tp.status='active') then raise exception 'Not authorized'; end if;
  select * into np from public.team_nomination_players where nomination_id=n.id and player_id=(item->>'player_id')::uuid for update;
  if np.player_id is null then raise exception 'Not nominated'; end if;
  if n.status<>'open' or n.starts_at<=now() or private.training_team_release_at(n)>now()
   or item->>'version' is distinct from md5(private.training_notification_version(n)||np.response||coalesce(np.responded_at::text,''))
   or (p_pending_only and (np.response<>'pending' or exists(select 1 from public.training_notifications a where a.user_id=auth.uid() and a.nomination_id=n.id and a.kind='changed' and a.version=private.training_notification_version(n)))) then
   if p_pending_only then continue; else raise exception 'Training changed; reload'; end if;
  end if;
  perform public.respond_to_team_nomination(n.id,np.player_id,p_response,p_reason);
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.get_my_training_plan(date) from public,anon;
revoke all on function public.respond_to_training_plan(jsonb,text,text,boolean) from public,anon;
grant execute on function public.get_my_training_plan(date) to authenticated;
grant execute on function public.respond_to_training_plan(jsonb,text,text,boolean) to authenticated;
