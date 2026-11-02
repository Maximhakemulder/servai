-- SERVAI · weer & evenementen, koelcellen (HACCP) en Google Bedrijfsprofiel
-- Veilig opnieuw uit te voeren.

-- ---------------------------------------------------------------- locatie: plaats voor het weer, regio voor schoolvakanties
alter table locaties add column if not exists plaats text;            -- bijvoorbeeld 'Rotterdam'; het dashboard zoekt zelf de coördinaten op
alter table locaties add column if not exists lat    numeric(8,5);    -- optioneel, overschrijft de plaats
alter table locaties add column if not exists lon    numeric(8,5);
alter table locaties add column if not exists regio  text;            -- schoolvakantieregio: noord, midden of zuid
do $$ begin
  alter table locaties add constraint locaties_regio_check check (regio in ('noord','midden','zuid'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- nieuwe soorten koppelingen
alter table koppelingen drop constraint if exists koppelingen_soort_check;
alter table koppelingen add constraint koppelingen_soort_check
  check (soort in ('kassa','rooster','boekhouding','reserveringen','tanks','inkoop','reviews','temperatuur','google_profiel','evenementen'));

-- ---------------------------------------------------------------- koelcellen en vriezers (HACCP)
create table if not exists temperatuur_metingen (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  sensor      text not null,                         -- bijvoorbeeld 'Koelcel 1', 'Vriezer keuken'
  soort       text not null default 'koeling' check (soort in ('koeling','vriezer','overig')),
  gemeten     timestamptz not null,
  temp        numeric(5,2) not null,                 -- graden Celsius
  min_temp    numeric(5,2),                          -- eigen grenzen per sensor; leeg = standaard (koeling 0 tot 7, vriezer tot -18)
  max_temp    numeric(5,2),
  unique (locatie_id, sensor, gemeten)
);
create index if not exists temp_loc_tijd on temperatuur_metingen(locatie_id, gemeten desc);

-- ---------------------------------------------------------------- Google Bedrijfsprofiel, per dag
create table if not exists google_profiel_dag (
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  datum       date not null,
  zoeken      int not null default 0,   -- weergaven in Google Zoeken
  maps        int not null default 0,   -- weergaven in Google Maps
  routes      int not null default 0,   -- routebeschrijvingen aangevraagd
  bellen      int not null default 0,   -- keer gebeld via het profiel
  website     int not null default 0,   -- klikken naar de website
  reserveren  int not null default 0,   -- klikken op reserveren/menu (als Google dit levert)
  primary key (locatie_id, datum)
);

-- ---------------------------------------------------------------- lokale evenementen (markt, concert, wedstrijd, beurs)
-- Feestdagen en schoolvakanties rekent het dashboard zelf uit; dit is voor wat er in de buurt gebeurt.
create table if not exists evenementen (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid references locaties(id) on delete cascade,   -- leeg = alle locaties van de klant
  datum       date not null,
  tot         date,
  naam        text not null,
  drukte      text not null default 'druk' check (drukte in ('rustig','normaal','druk','zeer_druk')),
  unique (klant_id, datum, naam)
);
create index if not exists evenementen_klant_dag on evenementen(klant_id, datum);

-- ---------------------------------------------------------------- rechten
alter table temperatuur_metingen enable row level security;
alter table google_profiel_dag  enable row level security;
alter table evenementen         enable row level security;
drop policy if exists temp_lezen on temperatuur_metingen;
create policy temp_lezen on temperatuur_metingen for select to authenticated using (mag_zien(klant_id, locatie_id));
drop policy if exists gprof_lezen on google_profiel_dag;
create policy gprof_lezen on google_profiel_dag for select to authenticated using (mag_zien(klant_id, locatie_id));
drop policy if exists event_lezen on evenementen;
create policy event_lezen on evenementen for select to authenticated using (mag_zien(klant_id, locatie_id));
drop policy if exists event_beheer on evenementen;
create policy event_beheer on evenementen for all to authenticated using (is_beheerder()) with check (is_beheerder());
grant select on temperatuur_metingen, google_profiel_dag, evenementen to authenticated;
grant insert, update, delete on evenementen to authenticated;
grant all on temperatuur_metingen, google_profiel_dag, evenementen to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
