-- SERVAI · basisschema (multi-tenant)
-- Elke klant (tenant) ziet alleen zijn eigen rijen. Row-level security (RLS) staat overal aan.
-- Data komt binnen via de serverfuncties (service role). De browser leest alleen, via RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- types
do $$ begin
  create type rol_type as enum ('eigenaar','bedrijfsleider','chef','boekhouder','bar','gastvrouw');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- klanten en locaties
create table if not exists klanten (
  id          uuid primary key default gen_random_uuid(),
  naam        text not null,
  status      text not null default 'actief' check (status in ('actief','gepauzeerd','opgezegd')),
  loonnorm_pct numeric(5,2) not null default 30,   -- norm voor loonkosten in % van omzet
  aangemaakt  timestamptz not null default now()
);

create table if not exists locaties (
  id        uuid primary key default gen_random_uuid(),
  klant_id  uuid not null references klanten(id) on delete cascade,
  naam      text not null,
  aangemaakt timestamptz not null default now()
);
create index if not exists locaties_klant on locaties(klant_id);

-- ---------------------------------------------------------------- gebruikers
-- Koppeling met Supabase Auth (auth.users). locatie_id leeg = alle locaties.
create table if not exists profielen (
  id          uuid primary key references auth.users(id) on delete cascade,
  klant_id    uuid not null references klanten(id) on delete cascade,
  naam        text not null,
  email       text not null,
  rol         rol_type not null default 'bedrijfsleider',
  locatie_id  uuid references locaties(id) on delete set null,
  toegang     text[] not null default '{}',   -- pagina's die deze persoon mag zien
  actief      boolean not null default true,
  laatst_gezien timestamptz,
  aangemaakt  timestamptz not null default now()
);
create index if not exists profielen_klant on profielen(klant_id);

-- Platformbeheerders (jij en je team). Zien alle klanten.
create table if not exists platform_beheerders (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------- hulpfuncties voor de rechten
create or replace function huidige_klant() returns uuid
language sql stable security definer set search_path = public as
$$ select klant_id from profielen where id = auth.uid() and actief $$;

create or replace function huidige_locatie() returns uuid
language sql stable security definer set search_path = public as
$$ select locatie_id from profielen where id = auth.uid() and actief $$;

create or replace function huidige_rol() returns rol_type
language sql stable security definer set search_path = public as
$$ select rol from profielen where id = auth.uid() and actief $$;

create or replace function is_beheerder() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from platform_beheerders where user_id = auth.uid()) $$;

-- Mag deze gebruiker rijen van deze klant en locatie zien?
create or replace function mag_zien(k uuid, l uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_beheerder()
       or (k = huidige_klant() and (huidige_locatie() is null or l is null or l = huidige_locatie())) $$;

-- ---------------------------------------------------------------- koppelingen
-- Zichtbare gegevens over een koppeling. De geheimen staan in een aparte tabel.
create table if not exists koppelingen (
  id            uuid primary key default gen_random_uuid(),
  klant_id      uuid not null references klanten(id) on delete cascade,
  locatie_id    uuid references locaties(id) on delete cascade,
  soort         text not null check (soort in ('kassa','rooster','boekhouding','reserveringen','tanks','inkoop','reviews')),
  systeem       text not null,                       -- bijvoorbeeld 'untill', 'zenchef'
  schema        text not null default 'elk uur',
  status        text not null default 'niet_getest' check (status in ('niet_getest','ok','fout','uit')),
  laatste_succes timestamptz,
  laatste_fout  text,
  aangemaakt    timestamptz not null default now()
);
create index if not exists koppelingen_klant on koppelingen(klant_id);

-- Versleutelde sleutels. GEEN policies: alleen de serverfuncties (service role) kunnen erbij.
create table if not exists koppeling_geheimen (
  koppeling_id uuid primary key references koppelingen(id) on delete cascade,
  gegevens     text not null,                         -- door de server versleuteld, nooit leesbaar in de browser
  bijgewerkt   timestamptz not null default now()
);

-- ---------------------------------------------------------------- data die binnenkomt
create table if not exists verkoop (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  locatie_id uuid not null references locaties(id) on delete cascade,
  tijdstip   timestamptz not null,
  artikel    text not null,
  groep      text,                                    -- bijvoorbeeld bar of keuken
  aantal     numeric(10,2) not null default 1,
  bedrag     numeric(12,2) not null,                  -- netto omzet in euro
  medewerker text,                                    -- voor upselling-ranking
  bron_ref   text,                                    -- id uit de kassa, voorkomt dubbel inlezen
  unique (locatie_id, bron_ref)
);
create index if not exists verkoop_loc_tijd on verkoop(locatie_id, tijdstip);

create table if not exists uren (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  datum       date not null,
  medewerker  text not null,                          -- naam of code uit het roostersysteem
  gepland_uren numeric(6,2) not null default 0,
  gewerkt_uren numeric(6,2) not null default 0,
  kosten      numeric(12,2) not null default 0,       -- loonkosten incl. werkgeverslasten
  bron_ref    text,
  unique (locatie_id, datum, medewerker)
);
create index if not exists uren_loc_datum on uren(locatie_id, datum);

create table if not exists reserveringen (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  locatie_id uuid not null references locaties(id) on delete cascade,
  tijdstip   timestamptz not null,
  personen   int not null,
  status     text not null default 'bevestigd',
  bron_ref   text,
  unique (locatie_id, bron_ref)
);

create table if not exists inkoop_regels (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  locatie_id uuid references locaties(id) on delete cascade,
  datum      date not null,
  leverancier text not null,
  artikel    text not null,
  hoeveelheid numeric(12,3),
  prijs_per_eenheid numeric(12,4),
  bron_ref   text,
  unique (klant_id, leverancier, bron_ref)
);

create table if not exists reviews (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  locatie_id uuid not null references locaties(id) on delete cascade,
  geplaatst  timestamptz not null,
  sterren    smallint not null check (sterren between 1 and 5),
  tekst      text,
  antwoord   text,
  bron_ref   text,
  unique (locatie_id, bron_ref)
);

create table if not exists tank_metingen (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  locatie_id uuid not null references locaties(id) on delete cascade,
  tank       text not null,
  biersoort  text,
  gemeten    timestamptz not null,
  vulling_pct numeric(5,2) not null check (vulling_pct between 0 and 100)
);
create index if not exists tank_loc_tijd on tank_metingen(locatie_id, tank, gemeten);

-- ---------------------------------------------------------------- loonkosten in % van omzet (de belangrijkste cijfers)
create or replace view loonkosten_per_dag with (security_invoker = true) as
with o as (
  select klant_id, locatie_id, (tijdstip at time zone 'Europe/Amsterdam')::date as datum, sum(bedrag) as omzet
  from verkoop group by 1,2,3
), u as (
  select klant_id, locatie_id, datum, sum(gepland_uren) as gepland_uren, sum(gewerkt_uren) as gewerkt_uren, sum(kosten) as loonkosten
  from uren group by 1,2,3
)
select coalesce(o.klant_id,u.klant_id) as klant_id,
       coalesce(o.locatie_id,u.locatie_id) as locatie_id,
       coalesce(o.datum,u.datum) as datum,
       coalesce(o.omzet,0) as omzet,
       coalesce(u.loonkosten,0) as loonkosten,
       coalesce(u.gepland_uren,0) as gepland_uren,
       coalesce(u.gewerkt_uren,0) as gewerkt_uren,
       case when coalesce(o.omzet,0) > 0 then round(coalesce(u.loonkosten,0) / o.omzet * 100, 1) end as loonkosten_pct
from o full join u on o.locatie_id = u.locatie_id and o.datum = u.datum;

-- ---------------------------------------------------------------- instellingen en samenwerking
create table if not exists melding_voorkeuren (
  profiel_id  uuid primary key references profielen(id) on delete cascade,
  instellingen jsonb not null default '{}',          -- kanalen, schema's en grenzen per melding
  bijgewerkt  timestamptz not null default now()
);

create table if not exists tickets (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  gemaakt_door uuid references profielen(id) on delete set null,
  titel      text not null,
  soort      text not null,
  pagina     text,
  urgentie   smallint not null default 1 check (urgentie between 0 and 3),
  status     text not null default 'open' check (status in ('open','bezig','wacht_op_klant','opgelost')),
  omschrijving text not null,
  verwacht   text,
  context    jsonb not null default '{}',            -- pagina, locatie, browser, tijdstip
  aangemaakt timestamptz not null default now()
);
create table if not exists ticket_berichten (
  id         bigint generated always as identity primary key,
  ticket_id  bigint not null references tickets(id) on delete cascade,
  van_support boolean not null default false,
  auteur     uuid references profielen(id) on delete set null,
  tekst      text not null,
  aangemaakt timestamptz not null default now()
);

create table if not exists advies_aanvragen (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  gemaakt_door uuid references profielen(id) on delete set null,
  traject    text not null,
  onderwerpen text[] not null default '{}',
  locatie_id uuid references locaties(id) on delete set null,
  voorkeur   text,
  vraag      text,
  status     text not null default 'nieuw',
  aangemaakt timestamptz not null default now()
);

create table if not exists logboek (
  id         bigint generated always as identity primary key,
  klant_id   uuid references klanten(id) on delete set null,
  user_id    uuid,
  actie      text not null,                          -- bijvoorbeeld 'koppeling_aangemaakt', 'bekijk_als'
  details    jsonb not null default '{}',
  tijd       timestamptz not null default now()
);

-- ================================================================ RLS
alter table klanten              enable row level security;
alter table locaties             enable row level security;
alter table profielen            enable row level security;
alter table platform_beheerders  enable row level security;
alter table koppelingen          enable row level security;
alter table koppeling_geheimen   enable row level security;   -- geen policies = alleen server
alter table verkoop              enable row level security;
alter table uren                 enable row level security;
alter table reserveringen        enable row level security;
alter table inkoop_regels        enable row level security;
alter table reviews              enable row level security;
alter table tank_metingen        enable row level security;
alter table melding_voorkeuren   enable row level security;
alter table tickets              enable row level security;
alter table ticket_berichten     enable row level security;
alter table advies_aanvragen     enable row level security;
alter table logboek              enable row level security;       -- geen policies = alleen server

-- klanten en locaties
create policy klanten_lezen   on klanten  for select to authenticated using (is_beheerder() or id = huidige_klant());
create policy locaties_lezen  on locaties for select to authenticated using (is_beheerder() or (klant_id = huidige_klant() and (huidige_locatie() is null or id = huidige_locatie())));

-- profielen: je ziet collega's van je eigen klant; de eigenaar beheert ze
create policy profielen_lezen   on profielen for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
create policy profielen_wijzigen on profielen for update to authenticated
  using (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() = 'eigenaar'))
  with check (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() = 'eigenaar'));

-- koppelingen: alleen de eigenaar (en beheerders) ziet de status, nooit de sleutels
create policy koppelingen_lezen on koppelingen for select to authenticated
  using (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() = 'eigenaar'));

-- data: lezen binnen eigen klant en locatie, schrijven alleen via de server
create policy verkoop_lezen        on verkoop        for select to authenticated using (mag_zien(klant_id, locatie_id));
create policy uren_lezen           on uren           for select to authenticated using (mag_zien(klant_id, locatie_id));
create policy reserveringen_lezen  on reserveringen  for select to authenticated using (mag_zien(klant_id, locatie_id));
create policy inkoop_lezen         on inkoop_regels  for select to authenticated using (mag_zien(klant_id, locatie_id));
create policy reviews_lezen        on reviews        for select to authenticated using (mag_zien(klant_id, locatie_id));
create policy tank_lezen           on tank_metingen  for select to authenticated using (mag_zien(klant_id, locatie_id));

-- eigen instellingen
create policy voorkeuren_eigen on melding_voorkeuren for all to authenticated
  using (profiel_id = auth.uid()) with check (profiel_id = auth.uid());

-- tickets: zelf melden, binnen de eigen klant lezen
create policy tickets_lezen    on tickets for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
create policy tickets_maken    on tickets for insert to authenticated with check (klant_id = huidige_klant() and gemaakt_door = auth.uid());
create policy tickets_wijzigen on tickets for update to authenticated using (klant_id = huidige_klant() or is_beheerder());
create policy berichten_lezen  on ticket_berichten for select to authenticated
  using (exists (select 1 from tickets t where t.id = ticket_id and (is_beheerder() or t.klant_id = huidige_klant())));
create policy berichten_maken  on ticket_berichten for insert to authenticated
  with check (auteur = auth.uid() and exists (select 1 from tickets t where t.id = ticket_id and (is_beheerder() or t.klant_id = huidige_klant())));

-- AI-advies: eigenaar en bedrijfsleider
create policy advies_lezen  on advies_aanvragen for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
create policy advies_maken  on advies_aanvragen for insert to authenticated
  with check (klant_id = huidige_klant() and gemaakt_door = auth.uid() and huidige_rol() in ('eigenaar','bedrijfsleider'));

-- platform_beheerders: niemand leest dit in de browser (de functies hierboven doen dat veilig)

-- ================================================================ GRANTS
-- Omdat "automatically expose new tables" uit staat, geven we hier bewust rechten.
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on klanten, locaties, profielen, koppelingen, verkoop, uren, reserveringen,
               inkoop_regels, reviews, tank_metingen, tickets, ticket_berichten, advies_aanvragen,
               loonkosten_per_dag to authenticated;
grant update on profielen, tickets to authenticated;
grant insert on tickets, ticket_berichten, advies_aanvragen to authenticated;
grant select, insert, update, delete on melding_voorkeuren to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- NIET aan authenticated: koppeling_geheimen, logboek, platform_beheerders
