-- Menu, ingrediënten, inkoopprijzen en recepten. Dit is voor kostprijs en prijswaarschuwingen;
-- SERVAI past nooit prijzen aan in de kassa of bij leveranciers.

create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  klant_id    uuid not null references klanten(id) on delete cascade,
  naam        text not null,
  groep       text,
  verkoopprijs numeric(10,2),
  bron        text not null default 'handmatig',     -- kassa, csv of handmatig
  unique (klant_id, naam)
);
create table if not exists ingredienten (
  id          uuid primary key default gen_random_uuid(),
  klant_id    uuid not null references klanten(id) on delete cascade,
  naam        text not null,
  eenheid     text not null default 'kg' check (eenheid in ('kg','l','stuk')),
  leverancier text,
  unique (klant_id, naam)
);
create table if not exists ingredient_prijzen (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  ingredient_id uuid not null references ingredienten(id) on delete cascade,
  datum       date not null,
  prijs_per_eenheid numeric(12,4) not null check (prijs_per_eenheid >= 0),   -- excl. btw, per kg / l / stuk
  leverancier text,
  bron        text not null default 'handmatig',     -- handmatig, csv of factuur
  unique (ingredient_id, datum)
);
create table if not exists recept_regels (
  id          bigint generated always as identity primary key,
  klant_id    uuid not null references klanten(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  ingredient_id uuid not null references ingredienten(id) on delete cascade,
  hoeveelheid numeric(12,4) not null check (hoeveelheid > 0),                 -- in de eenheid van het ingrediënt
  unique (menu_item_id, ingredient_id)
);
create index if not exists recept_regels_ing on recept_regels(ingredient_id);
create index if not exists ingredient_prijzen_ing on ingredient_prijzen(ingredient_id, datum desc);

-- Rechten: iedereen van de klant leest; eigenaar, bedrijfsleider en chef (zonder vaste locatie) schrijven.
do $$
declare t text;
begin
  foreach t in array array['menu_items','ingredienten','ingredient_prijzen','recept_regels'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_lezen', t);
    execute format('create policy %I on %I for select to authenticated using (mag_zien(klant_id, null))', t || '_lezen', t);
    execute format('drop policy if exists %I on %I', t || '_schrijven', t);
    execute format($p$create policy %I on %I for all to authenticated
      using (is_beheerder() or (klant_id = huidige_klant() and huidige_locatie() is null and huidige_rol() in ('eigenaar','bedrijfsleider','chef')))
      with check (is_beheerder() or (klant_id = huidige_klant() and huidige_locatie() is null and huidige_rol() in ('eigenaar','bedrijfsleider','chef')))$p$, t || '_schrijven', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Laatste en vorige prijs per ingrediënt
create or replace view ingredient_prijs_nu with (security_invoker = true) as
select i.id as ingredient_id, i.klant_id, i.naam, i.eenheid, i.leverancier as leverancier_standaard,
       p.prijs_per_eenheid as prijs, p.datum, p.leverancier,
       v.prijs_per_eenheid as vorige_prijs, v.datum as vorige_datum
from ingredienten i
left join lateral (select * from ingredient_prijzen where ingredient_id = i.id order by datum desc limit 1) p on true
left join lateral (select * from ingredient_prijzen where ingredient_id = i.id order by datum desc offset 1 limit 1) v on true;

-- Kostprijs per gerecht, nu en vóór de laatste prijsverandering
create or replace view gerecht_kostprijs with (security_invoker = true) as
select m.id as menu_item_id, m.klant_id, m.naam, m.groep, m.verkoopprijs,
       count(r.id) as regels,
       coalesce(sum(r.hoeveelheid * coalesce(n.prijs, 0)), 0) as kostprijs,
       coalesce(sum(r.hoeveelheid * coalesce(n.vorige_prijs, n.prijs, 0)), 0) as kostprijs_vorig,
       count(r.id) filter (where n.prijs is null) as zonder_prijs
from menu_items m
left join recept_regels r on r.menu_item_id = m.id
left join ingredient_prijs_nu n on n.ingredient_id = r.ingredient_id
group by m.id;
grant select on ingredient_prijs_nu, gerecht_kostprijs to authenticated;
