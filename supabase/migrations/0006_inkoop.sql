-- Inkoop: regels uit facturen of een Excel/CSV-upload.
create table if not exists inkoop (
  id           bigint generated always as identity primary key,
  klant_id     uuid not null references klanten(id) on delete cascade,
  locatie_id   uuid not null references locaties(id) on delete cascade,
  datum        date not null,
  leverancier  text not null,
  omschrijving text,
  categorie    text,
  aantal       numeric(12,3),
  bedrag       numeric(12,2) not null,   -- excl. btw
  factuur_ref  text,
  bron_ref     text not null,
  unique (locatie_id, bron_ref)
);
create index if not exists inkoop_locatie_datum on inkoop(locatie_id, datum);
alter table inkoop enable row level security;
drop policy if exists inkoop_lezen on inkoop;
create policy inkoop_lezen on inkoop for select to authenticated using (mag_zien(klant_id, locatie_id));
grant select on inkoop to authenticated;
grant all on inkoop to service_role;

create or replace view inkoop_per_dag with (security_invoker = true) as
select klant_id, locatie_id, datum as bedrijfsdag, leverancier,
       coalesce(categorie, 'Overig') as categorie,
       sum(bedrag) as bedrag, count(*) as regels
from inkoop group by klant_id, locatie_id, datum, leverancier, 5;
grant select on inkoop_per_dag to authenticated;
