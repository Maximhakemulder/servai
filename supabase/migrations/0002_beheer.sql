-- SERVAI · beheer: abonnementen, agenda, aanvragen (leads) en rechten voor platformbeheerders.
-- Veilig opnieuw uit te voeren (if not exists / drop policy if exists).

-- ---------------------------------------------------------------- klanten uitbreiden
alter table klanten add column if not exists notities text;
alter table klanten add column if not exists contact_naam text;
alter table klanten add column if not exists contact_email text;
alter table klanten add column if not exists contact_tel text;

-- ---------------------------------------------------------------- abonnementen
create table if not exists plannen (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  naam          text not null,
  omschrijving  text,
  prijs_per_locatie numeric(10,2) not null default 0,   -- per locatie per maand, excl. btw
  modules       text[] not null default '{}',
  actief        boolean not null default true,
  volgorde      int not null default 0
);

create table if not exists abonnementen (
  id              uuid primary key default gen_random_uuid(),
  klant_id        uuid not null unique references klanten(id) on delete cascade,
  plan_id         uuid references plannen(id) on delete set null,
  status          text not null default 'proef' check (status in ('proef','actief','gepauzeerd','opgezegd')),
  aantal_locaties int not null default 1,
  prijs_maand     numeric(10,2) not null default 0,     -- werkelijke prijs per maand (kan afwijken van het plan)
  interval        text not null default 'maand' check (interval in ('maand','jaar')),
  start_datum     date not null default current_date,
  proef_tot       date,
  volgende_factuur date,
  opzeg_datum     date,
  notities        text,
  bijgewerkt      timestamptz not null default now()
);

-- ---------------------------------------------------------------- aanvragen (leads van de homepage)
create table if not exists aanvragen (
  id          bigint generated always as identity primary key,
  naam        text not null,
  bedrijf     text,
  email       text not null,
  telefoon    text,
  aantal_locaties text,
  interesse   text,
  bericht     text,
  bron        text not null default 'homepage',
  status      text not null default 'nieuw' check (status in ('nieuw','gebeld','demo_gepland','klant','afgewezen')),
  notities    text,
  klant_id    uuid references klanten(id) on delete set null,
  aangemaakt  timestamptz not null default now()
);

-- ---------------------------------------------------------------- agenda
create table if not exists afspraken (
  id          bigint generated always as identity primary key,
  titel       text not null,
  soort       text not null default 'overig' check (soort in ('demo','onboarding','check-in','support','advies','overig')),
  start_tijd  timestamptz not null,
  eind_tijd   timestamptz,
  plaats      text,                                       -- adres of videolink
  notities    text,
  status      text not null default 'gepland' check (status in ('gepland','afgerond','geannuleerd')),
  klant_id    uuid references klanten(id) on delete cascade,
  aanvraag_id bigint references aanvragen(id) on delete set null,
  gemaakt_door uuid,
  aangemaakt  timestamptz not null default now()
);
create index if not exists afspraken_start on afspraken(start_tijd);
create index if not exists afspraken_klant on afspraken(klant_id);

-- ---------------------------------------------------------------- voorbeeldplannen (prijzen zijn aan te passen in Beheer)
insert into plannen (code, naam, omschrijving, prijs_per_locatie, modules, volgorde) values
  ('start', 'Start',  'Loonkosten in % van omzet, rapporten en meldingen',              149, array['loonkosten','overzicht','meldingen'], 1),
  ('groei', 'Groei',  'Start plus planning, inkoop, reserveringen en reviews',           249, array['loonkosten','overzicht','meldingen','personeel','inkoop','reserveringen','gasten'], 2),
  ('pro',   'Pro',    'Alles, inclusief WhatsApp-assistent en AI-advies',                399, array['alles'], 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- RLS
alter table plannen      enable row level security;
alter table abonnementen enable row level security;
alter table aanvragen    enable row level security;   -- geen policies voor klanten: alleen beheerders
alter table afspraken    enable row level security;

drop policy if exists plannen_lezen on plannen;
create policy plannen_lezen on plannen for select to authenticated using (true);
drop policy if exists plannen_beheer on plannen;
create policy plannen_beheer on plannen for all to authenticated using (is_beheerder()) with check (is_beheerder());

drop policy if exists abonnementen_lezen on abonnementen;
create policy abonnementen_lezen on abonnementen for select to authenticated
  using (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() = 'eigenaar'));
drop policy if exists abonnementen_beheer on abonnementen;
create policy abonnementen_beheer on abonnementen for all to authenticated using (is_beheerder()) with check (is_beheerder());

drop policy if exists aanvragen_beheer on aanvragen;
create policy aanvragen_beheer on aanvragen for all to authenticated using (is_beheerder()) with check (is_beheerder());

drop policy if exists afspraken_lezen on afspraken;
create policy afspraken_lezen on afspraken for select to authenticated
  using (is_beheerder() or (klant_id is not null and klant_id = huidige_klant()));
drop policy if exists afspraken_beheer on afspraken;
create policy afspraken_beheer on afspraken for all to authenticated using (is_beheerder()) with check (is_beheerder());

-- beheerders mogen klanten en locaties aanpassen en als support op tickets reageren
drop policy if exists klanten_beheer on klanten;
create policy klanten_beheer on klanten for update to authenticated using (is_beheerder()) with check (is_beheerder());
drop policy if exists locaties_beheer on locaties;
create policy locaties_beheer on locaties for all to authenticated using (is_beheerder()) with check (is_beheerder());
drop policy if exists berichten_beheer on ticket_berichten;
create policy berichten_beheer on ticket_berichten for insert to authenticated with check (is_beheerder());

-- ---------------------------------------------------------------- GRANTS
grant select on plannen, abonnementen, afspraken to authenticated;
grant insert, update, delete on plannen, abonnementen, aanvragen, afspraken to authenticated;
grant select on aanvragen to authenticated;
grant update on klanten to authenticated;
grant insert, update, delete on locaties to authenticated;
grant all on plannen, abonnementen, aanvragen, afspraken to service_role;
grant usage, select on all sequences in schema public to authenticated;
-- Let op: de policies hierboven beperken het schrijven tot beheerders.
