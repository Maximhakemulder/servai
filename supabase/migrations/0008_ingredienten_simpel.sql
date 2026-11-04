-- Eenvoudiger: ingrediënten zijn een lijst (prijs en hoeveelheid zijn optioneel).
-- De klant vult zelf de kostprijs per gerecht in en koppelt ingrediënten aan gerechten.
-- Stijgt een inkoopprijs, dan laat SERVAI zien welke gerechten dat raakt. SERVAI past nooit prijzen aan.

alter table menu_items add column if not exists kostprijs numeric(10,2) check (kostprijs is null or kostprijs >= 0);

alter table recept_regels alter column hoeveelheid drop not null;
alter table recept_regels drop constraint if exists recept_regels_hoeveelheid_check;
alter table recept_regels add constraint recept_regels_hoeveelheid_check check (hoeveelheid is null or hoeveelheid > 0);

-- Kostprijs: eerst wat de klant zelf invult, anders berekend uit hoeveelheid x inkoopprijs
create or replace view gerecht_kostprijs with (security_invoker = true) as
select m.id as menu_item_id, m.klant_id, m.naam, m.groep, m.verkoopprijs,
       count(r.id) as regels,
       coalesce(m.kostprijs, sum(r.hoeveelheid * coalesce(n.prijs, 0)), 0) as kostprijs,
       coalesce(m.kostprijs, sum(r.hoeveelheid * coalesce(n.vorige_prijs, n.prijs, 0)), 0) as kostprijs_vorig,
       count(r.id) filter (where n.prijs is null) as zonder_prijs,
       (m.kostprijs is not null) as kostprijs_ingevuld
from menu_items m
left join recept_regels r on r.menu_item_id = m.id
left join ingredient_prijs_nu n on n.ingredient_id = r.ingredient_id
group by m.id;
grant select on gerecht_kostprijs to authenticated;
