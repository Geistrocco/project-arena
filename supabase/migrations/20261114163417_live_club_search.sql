-- Accent-insensitive fragments, matched independently in any word order.
-- NFD also handles names or queries containing decomposed Unicode accents.
create function private.normalize_club_search(p_value text)
returns text language sql immutable parallel safe set search_path='' as $$
 select trim(regexp_replace(regexp_replace(normalize(lower(coalesce(p_value,'')),NFD),U&'[\0300-\036f]','','g'),'[[:space:]]+',' ','g'));
$$;
revoke all on function private.normalize_club_search(text) from public,anon,authenticated;

create or replace function public.search_joinable_teams(p_query text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare query_text text:=private.normalize_club_search(p_query);begin
 perform private.join_verified_user();
 if char_length(query_text)<2 or char_length(p_query)>100 then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(x order by x.season desc,x.name,x.category,x.id),'[]'::jsonb) from (
 select t.id,t.name,t.category,t.season,c.city,
 exists(select 1 from public.team_memberships m where m.team_id=t.id and m.role in ('coach','manager','club_admin')) as has_staff
 from public.club_teams t join public.clubs c on c.id=t.club_id
 where t.status='active' and c.status='active'
 and not exists(select 1 from unnest(string_to_array(query_text,' ')) as fragment(value)
 where position(fragment.value in private.normalize_club_search(concat_ws(' ',c.name,t.name,t.category,t.season,c.city)))=0)
 order by t.season desc,t.name,t.category,t.id limit 40) x);
end $$;
revoke all on function public.search_joinable_teams(text) from public,anon;
grant execute on function public.search_joinable_teams(text) to authenticated;
