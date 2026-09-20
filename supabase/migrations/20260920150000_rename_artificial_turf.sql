-- Keep existing tournaments searchable under the term used in the filters.
alter table public.tournaments drop constraint tournaments_surface_check;

update public.tournaments
set surface = 'Umelý trávnik'
where surface = 'Umelá tráva';

alter table public.tournaments add constraint tournaments_surface_check check (
  surface is null or surface = any(array[
    'Prírodný trávnik','Umelý trávnik','Hala','Ľadová plocha','Antuka','Tvrdý povrch','Iný povrch'
  ])
);
