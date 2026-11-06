-- SERVAI · weer per dag per locatie (gemeten en verwachting), bron Open-Meteo. Veilig opnieuw uit te voeren.
create table if not exists weer_dagen (
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  datum       date not null,
  code        int,                 -- WMO-weercode
  temp_max    numeric(4,1),
  temp_min    numeric(4,1),
  neerslag_mm numeric(5,1),
  regenkans   int,                 -- alleen bij verwachting
  wind_max    numeric(5,1),        -- km/u
  zon_uren    numeric(4,1),
  gemeten     boolean not null default false,   -- false = verwachting, true = achteraf vastgelegd
  bijgewerkt  timestamptz not null default now(),
  primary key (locatie_id, datum)
);
alter table weer_dagen enable row level security;
drop policy if exists weer_lezen on weer_dagen;
create policy weer_lezen on weer_dagen for select to authenticated using (mag_zien(klant_id, locatie_id));
grant select on weer_dagen to authenticated;
grant all on weer_dagen to service_role;

-- Weer-koppeling als soort tonen bij koppelingen
alter table koppelingen drop constraint if exists koppelingen_soort_check;
alter table koppelingen add constraint koppelingen_soort_check
  check (soort in ('kassa','rooster','boekhouding','reserveringen','tanks','inkoop','reviews','temperatuur','google_profiel','evenementen','weer'));
