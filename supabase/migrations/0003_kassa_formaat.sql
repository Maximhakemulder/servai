-- SERVAI · standaard kassaformaat
-- Elke kassa (Untill, Lightspeed, ...) wordt door zijn inleesmodule vertaald naar deze vaste tabellen.
-- Het dashboard leest alleen hieruit en weet dus niet welk kassasysteem erachter zit.
-- Veilig opnieuw uit te voeren.

-- ---------------------------------------------------------------- bonnen (één rij per afgerekende bon)
create table if not exists bonnen (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  locatie_id  uuid not null references locaties(id) on delete cascade,
  bon_ref     text not null,                    -- bonnummer of id uit de kassa (voorkomt dubbel inlezen)
  tijdstip    timestamptz not null,             -- moment van afrekenen
  bedrijfsdag date not null,                    -- horecadag: een bon om 01:00 hoort bij de dag ervoor
  couverts    int,                              -- aantal gasten, mag leeg zijn
  tafel       text,
  medewerker  text,
  betaalwijze text,                             -- pin, contant, creditcard, bon, ...
  totaal      numeric(12,2) not null,           -- bedrag incl. btw zoals op de bon
  netto       numeric(12,2) not null,           -- omzet excl. btw (hierop rekenen we)
  btw         numeric(12,2),
  fooi        numeric(12,2),
  korting     numeric(12,2) not null default 0,
  is_storno   boolean not null default false,   -- creditbon of retour
  aangemaakt  timestamptz not null default now(),
  unique (locatie_id, bon_ref)
);
create index if not exists bonnen_loc_dag on bonnen(locatie_id, bedrijfsdag);
create index if not exists bonnen_loc_tijd on bonnen(locatie_id, tijdstip);

-- ---------------------------------------------------------------- verkoopregels uitbreiden
alter table verkoop add column if not exists bon_ref     text;
alter table verkoop add column if not exists bedrijfsdag date;
alter table verkoop add column if not exists btw_pct     numeric(5,2);
alter table verkoop add column if not exists korting     numeric(12,2) not null default 0;
create index if not exists verkoop_loc_dag on verkoop(locatie_id, bedrijfsdag);

-- De bedrijfsdag wordt automatisch gezet als de kassa hem niet meestuurt (dag loopt tot 05:00 's nachts).
create or replace function zet_bedrijfsdag() returns trigger language plpgsql as
$$ begin
  if new.bedrijfsdag is null then
    new.bedrijfsdag := ((new.tijdstip at time zone 'Europe/Amsterdam') - interval '5 hours')::date;
  end if;
  return new;
end $$;

drop trigger if exists bonnen_bedrijfsdag on bonnen;
create trigger bonnen_bedrijfsdag before insert or update of tijdstip on bonnen
  for each row execute function zet_bedrijfsdag();
drop trigger if exists verkoop_bedrijfsdag on verkoop;
create trigger verkoop_bedrijfsdag before insert or update of tijdstip on verkoop
  for each row execute function zet_bedrijfsdag();

-- Bestaande regels (uit 0001) krijgen alsnog een bedrijfsdag.
update verkoop set bedrijfsdag = ((tijdstip at time zone 'Europe/Amsterdam') - interval '5 hours')::date where bedrijfsdag is null;

-- ---------------------------------------------------------------- rechten
alter table bonnen enable row level security;
drop policy if exists bonnen_lezen on bonnen;
create policy bonnen_lezen on bonnen for select to authenticated using (mag_zien(klant_id, locatie_id));
grant select on bonnen to authenticated;
grant all on bonnen to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------- overzichten voor het dashboard
-- Alle views draaien met de rechten van de gebruiker (security_invoker), dus RLS blijft gelden.

-- omzet per dag per locatie (storno's staan als negatieve bedragen in 'netto' en tellen niet mee als bon)
create or replace view omzet_per_dag with (security_invoker = true) as
select klant_id, locatie_id, bedrijfsdag,
       sum(netto)                                        as omzet,
       count(*) filter (where not is_storno)             as bonnen,
       coalesce(sum(couverts) filter (where not is_storno), 0) as couverts,
       coalesce(sum(fooi), 0)                            as fooi,
       coalesce(sum(korting), 0)                         as korting,
       coalesce(sum(totaal) filter (where betaalwijze = 'pin'), 0)     as pin,
       coalesce(sum(totaal) filter (where betaalwijze = 'contant'), 0) as contant
from bonnen group by klant_id, locatie_id, bedrijfsdag;

-- omzet per klokuur (uur 0-23 in lokale tijd)
create or replace view omzet_per_uur with (security_invoker = true) as
select klant_id, locatie_id, bedrijfsdag,
       extract(hour from tijdstip at time zone 'Europe/Amsterdam')::int as uur,
       sum(netto) as omzet,
       count(*) filter (where not is_storno) as bonnen
from bonnen group by klant_id, locatie_id, bedrijfsdag, 4;

-- omzet per productgroep (bijvoorbeeld bier, wijn, keuken)
create or replace view verkoop_per_groep_dag with (security_invoker = true) as
select klant_id, locatie_id, bedrijfsdag, coalesce(groep, 'Overig') as groep,
       sum(aantal) as aantal, sum(bedrag) as omzet
from verkoop group by klant_id, locatie_id, bedrijfsdag, 4;

-- omzet per artikel
create or replace view verkoop_per_artikel_dag with (security_invoker = true) as
select klant_id, locatie_id, bedrijfsdag, artikel, coalesce(groep, 'Overig') as groep,
       sum(aantal) as aantal, sum(bedrag) as omzet
from verkoop group by klant_id, locatie_id, bedrijfsdag, artikel, 5;

-- omzet per medewerker (voor upselling en ranglijsten)
create or replace view omzet_per_medewerker_dag with (security_invoker = true) as
select klant_id, locatie_id, bedrijfsdag, coalesce(medewerker, 'Onbekend') as medewerker,
       sum(netto) as omzet, count(*) filter (where not is_storno) as bonnen,
       coalesce(sum(couverts) filter (where not is_storno), 0) as couverts
from bonnen group by klant_id, locatie_id, bedrijfsdag, 4;

-- loonkosten in % van omzet: omzet komt nu uit de bonnen, op bedrijfsdag
create or replace view loonkosten_per_dag with (security_invoker = true) as
with o as (
  select klant_id, locatie_id, bedrijfsdag as datum, sum(netto) as omzet from bonnen group by 1,2,3
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

grant select on omzet_per_dag, omzet_per_uur, verkoop_per_groep_dag, verkoop_per_artikel_dag,
               omzet_per_medewerker_dag, loonkosten_per_dag to authenticated;
