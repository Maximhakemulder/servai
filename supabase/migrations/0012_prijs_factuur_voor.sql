-- Een prijs uit een factuur gaat altijd voor op een zelf ingevulde of geüploade prijs.
-- Zonder factuurprijs geldt de laatste andere prijs. "Vorige prijs" komt uit dezelfde bron als de huidige.
create or replace view ingredient_prijs_nu with (security_invoker = true) as
select i.id as ingredient_id, i.klant_id, i.naam, i.eenheid, i.leverancier as leverancier_standaard,
       p.prijs_per_eenheid as prijs, p.datum, p.leverancier, p.bron,
       v.prijs_per_eenheid as vorige_prijs, v.datum as vorige_datum
from ingredienten i
left join lateral (select * from ingredient_prijzen where ingredient_id = i.id
                   order by (bron = 'factuur') desc, datum desc limit 1) p on true
left join lateral (select * from ingredient_prijzen where ingredient_id = i.id and p.bron is not null
                   and ((bron = 'factuur') = (p.bron = 'factuur'))
                   order by datum desc offset 1 limit 1) v on true;
grant select on ingredient_prijs_nu to authenticated;
