create extension if not exists pg_trgm with schema extensions;

create table public.clubs (
  id text primary key,
  name text not null check (char_length(name) between 2 and 160),
  short_name text not null check (char_length(short_name) between 1 and 80),
  sport text not null,
  country text not null,
  city text not null,
  logo_url text,
  logo_placeholder text not null check (char_length(logo_placeholder) between 1 and 5),
  source text not null default 'manual',
  source_id text,
  source_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index clubs_name_search_idx on public.clubs using gin (name extensions.gin_trgm_ops);
create index clubs_city_search_idx on public.clubs using gin (city extensions.gin_trgm_ops);
create index clubs_directory_filter_idx on public.clubs (status, sport, country);

alter table public.clubs enable row level security;

create policy "Active clubs are publicly readable"
on public.clubs
for select
to anon, authenticated
using (status = 'active');

revoke all on table public.clubs from anon, authenticated;
grant select on table public.clubs to anon, authenticated;

insert into public.clubs (id, name, short_name, sport, country, city, logo_placeholder)
values
  ('dac-1904', 'FK DAC 1904 Dunajská Streda', 'DAC 1904', 'football', 'Slovensko', 'Dunajská Streda', 'DAC'),
  ('slovan-bratislava', 'ŠK Slovan Bratislava futbal', 'Slovan', 'football', 'Slovensko', 'Bratislava', 'ŠKB'),
  ('spartak-trnava', 'FC Spartak Trnava', 'Spartak', 'football', 'Slovensko', 'Trnava', 'FCS'),
  ('as-trencin', 'AS Trenčín', 'Trenčín', 'football', 'Slovensko', 'Trenčín', 'AST'),
  ('inter-bratislava', 'FK Inter Bratislava', 'Inter', 'football', 'Slovensko', 'Bratislava', 'FKI'),
  ('petrzalka', 'FC Petržalka', 'Petržalka', 'football', 'Slovensko', 'Bratislava', 'FCP'),
  ('karlova-ves', 'FKM Karlova Ves Bratislava', 'Karlova Ves', 'football', 'Slovensko', 'Bratislava', 'FKM'),
  ('banik-prievidza', 'FC Baník Prievidza', 'Baník', 'football', 'Slovensko', 'Prievidza', 'FCB'),
  ('fc-nitra', 'FC Nitra', 'Nitra', 'football', 'Slovensko', 'Nitra', 'FCN'),
  ('vion-zlate-moravce', 'FC ViOn Zlaté Moravce – Vráble', 'ViOn', 'football', 'Slovensko', 'Zlaté Moravce', 'VIO'),
  ('kfc-komarno', 'KFC Komárno futbal', 'Komárno', 'football', 'Slovensko', 'Komárno', 'KFC'),
  ('sdm-domino', 'SDM Domino', 'Domino', 'football', 'Slovensko', 'Bratislava', 'SDM'),
  ('slovan-levice', 'FK Slovan Levice', 'Levice', 'football', 'Slovensko', 'Levice', 'FKL'),
  ('msk-puchov', 'MŠK Púchov', 'Púchov', 'football', 'Slovensko', 'Púchov', 'MŠK'),
  ('raca-bratislava', 'FK Rača Bratislava', 'Rača', 'football', 'Slovensko', 'Bratislava', 'FKR'),
  ('spartak-dubnica', 'FK Spartak Dubnica nad Váhom', 'Dubnica', 'football', 'Slovensko', 'Dubnica nad Váhom', 'FSD'),
  ('mfk-skalica', 'MFK Skalica', 'Skalica', 'football', 'Slovensko', 'Skalica', 'MFK'),
  ('msk-senec', 'MŠK Senec', 'Senec', 'football', 'Slovensko', 'Senec', 'MŠK'),
  ('stk-samorin', 'FC ŠTK 1914 Šamorín', 'Šamorín', 'football', 'Slovensko', 'Šamorín', 'ŠTK'),
  ('povazska-bystrica', 'MŠK Považská Bystrica', 'Považská Bystrica', 'football', 'Slovensko', 'Považská Bystrica', 'PBY'),
  ('fc-topolcany', 'FC Topoľčany', 'Topoľčany', 'football', 'Slovensko', 'Topoľčany', 'FCT');
