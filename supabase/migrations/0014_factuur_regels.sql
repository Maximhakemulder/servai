-- Uitgelezen factuurregels: automatisch gecategoriseerd (food/drank/overig) + prijswijzigingen per product en leverancier.
alter table facturen add column if not exists factuurnummer text;
alter table facturen add column if not exists verwerkt_op timestamptz;
alter table facturen add column if not exists fout text;

create table if not exists factuur_regels (
  id          bigint generated always as identity primary key,
  factuur_id  uuid not null references facturen(id) on delete cascade,
  klant_id    uuid not null references klanten(id) on delete cascade,
  datum       date not null,
  leverancier text,
  omschrijving text not null,
  sleutel     text not null,                          -- genormaliseerde naam, om dezelfde producten te herkennen
  categorie   text not null default 'overig' check (categorie in ('food','drank','overig')),
  aantal      numeric(12,3),
  eenheid     text,                                   -- kg, l, stuk of verpakking
  prijs_per_eenheid numeric(12,4),                    -- excl. btw
  bedrag      numeric(12,2)
);
create index if not exists factuur_regels_klant on factuur_regels(klant_id, datum desc);
create index if not exists factuur_regels_factuur on factuur_regels(factuur_id);
create index if not exists factuur_regels_product on factuur_regels(klant_id, leverancier, sleutel, datum desc);
alter table factuur_regels enable row level security;
drop policy if exists factuur_regels_lezen on factuur_regels;
create policy factuur_regels_lezen on factuur_regels for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
grant select on factuur_regels to authenticated;

create or replace view factuur_prijswijzigingen with (security_invoker = true) as
with p as (
  select id, klant_id, leverancier, sleutel, eenheid, categorie, omschrijving, datum, prijs_per_eenheid as prijs,
         row_number() over (partition by klant_id, leverancier, sleutel, eenheid order by datum desc, id desc) as rn
  from factuur_regels where prijs_per_eenheid > 0)
select n.klant_id, n.leverancier, n.sleutel, n.omschrijving, n.categorie, n.eenheid,
       v.prijs as vorige_prijs, n.prijs as prijs, v.datum as vorige_datum, n.datum,
       round((n.prijs - v.prijs) / v.prijs * 100, 1) as pct
from p n join p v on v.klant_id = n.klant_id and v.leverancier is not distinct from n.leverancier
                 and v.sleutel = n.sleutel and v.eenheid is not distinct from n.eenheid and v.rn = 2
where n.rn = 1 and n.datum > v.datum;
grant select on factuur_prijswijzigingen to authenticated;
