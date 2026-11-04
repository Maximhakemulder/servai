-- Rooster: elke dienst met begin- en eindtijd. Een nieuwe upload vervangt het bestaande rooster
-- voor de datums die in het bestand staan. De geplande uren per dag (tabel uren) worden daaruit bijgewerkt.
create table if not exists rooster (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  datum       date not null,
  medewerker  text not null,
  begin_tijd  text,                       -- HH:MM, leeg als alleen uren bekend zijn
  eind_tijd   text,
  uren        numeric(6,2) not null default 0,
  functie     text,
  bron        text not null default 'upload'
);
create index if not exists rooster_loc_datum on rooster(locatie_id, datum);
alter table rooster enable row level security;
drop policy if exists rooster_lezen on rooster;
create policy rooster_lezen on rooster for select to authenticated using (mag_zien(klant_id, locatie_id));
grant select on rooster to authenticated;
grant all on rooster to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
