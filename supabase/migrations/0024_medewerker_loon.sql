-- Uurloon per medewerker (uit Nostradamus). Alleen zichtbaar voor de eigenaar van de klant en voor SERVAI-beheerders.
create table if not exists medewerker_loon (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  medewerker  text not null,
  uurloon     numeric(8,2),                       -- bruto per uur
  schaal      numeric(8,2),
  bijgewerkt  timestamptz not null default now(),
  unique (locatie_id, medewerker)
);
alter table medewerker_loon enable row level security;
drop policy if exists medewerker_loon_lezen on medewerker_loon;
create policy medewerker_loon_lezen on medewerker_loon for select to authenticated
  using (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() = 'eigenaar' and mag_zien(klant_id, locatie_id)));
grant select on medewerker_loon to authenticated;
grant all on medewerker_loon to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
notify pgrst, 'reload schema';
