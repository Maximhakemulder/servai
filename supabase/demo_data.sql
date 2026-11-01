-- DEMODATA voor je eerste klant: 60 dagen nepbonnen, verkoopregels en uren, zodat je het dashboard kunt zien werken.
-- Voer dit uit NADAT 0001, 0002, 0003 en seed_eerste_klant.sql gelukt zijn.
-- Het gebruikt de eerste 4 locaties van de eerste klant. Alle demorijen beginnen met 'demo-' en zijn onderaan weer te verwijderen.

drop table if exists _art, _bon, _reg;

create temp table _art (artikel text, groep text, prijs numeric, btw numeric);
insert into _art values
 ('Pilsner','Bier',4.20,21), ('Speciaalbier','Bier',6.50,21), ('Huiswijn wit','Wijn',5.80,21), ('Huiswijn rood','Wijn',5.80,21),
 ('Gin-tonic','Cocktails',10.50,21), ('Cola','Fris',3.60,9), ('Koffie','Koffie',3.30,9),
 ('Burger','Keuken',18.50,9), ('Zalmschotel','Keuken',24.50,9), ('Tosti','Keuken',8.50,9),
 ('Bitterballen','Snacks',9.00,9), ('Nachos','Snacks',10.50,9), ('Dame blanche','Dessert',8.50,9);

create temp table _bon as
select l.klant_id, l.id as locatie_id, l.n, d::date as dag, b,
       'demo-' || d::date || '-' || l.n || '-' || b as bon_ref,
       ((d::date + make_interval(hours => t.h, mins => t.m)) at time zone 'Europe/Amsterdam') as tijdstip,
       1 + (random() * 3)::int as couverts,
       (array['Sanne','Daan','Lotte','Mees','Fleur'])[1 + (random() * 4)::int] as medewerker,
       (array['pin','pin','pin','contant','creditcard'])[1 + (random() * 4)::int] as betaalwijze,
       2 + (random() * 3)::int as nlines
from (select id, klant_id, row_number() over (order by aangemaakt, naam) as n from locaties where klant_id = (select id from klanten order by aangemaakt, id limit 1) order by aangemaakt, naam limit 4) l
cross join generate_series(current_date - 60, current_date - 1, interval '1 day') d
cross join lateral generate_series(1, ((40 + random() * 30) * case when extract(isodow from d) in (5,6,7) then 2 else 1 end)::int) b
cross join lateral (select 12 + floor((random() + random()) / 2 * 12 + b * 0)::int as h, (random() * 59 + b * 0)::int as m) t;

create temp table _reg as
select b.klant_id, b.locatie_id, b.bon_ref, b.tijdstip, b.couverts, b.medewerker, b.betaalwijze,
       r, a.artikel, a.groep, a.prijs, a.btw, 1 + (random() * 1.5)::int as aantal
from _bon b
cross join lateral generate_series(1, b.nlines) r
cross join lateral (select * from _art order by md5(b.bon_ref || r || random()::text) limit 1) a;

insert into bonnen (klant_id, locatie_id, bon_ref, tijdstip, couverts, medewerker, betaalwijze, totaal, netto, btw, fooi)
select klant_id, locatie_id, bon_ref, tijdstip, couverts, medewerker, betaalwijze,
       round(sum(aantal * prijs), 2),
       round(sum(aantal * prijs / (1 + btw / 100)), 2),
       round(sum(aantal * prijs) - sum(aantal * prijs / (1 + btw / 100)), 2),
       case when betaalwijze = 'pin' and random() < 0.4 then round((random() * 5)::numeric, 2) end
from _reg
group by klant_id, locatie_id, bon_ref, tijdstip, couverts, medewerker, betaalwijze
on conflict do nothing;

insert into verkoop (klant_id, locatie_id, tijdstip, artikel, groep, aantal, bedrag, medewerker, bron_ref, bon_ref, btw_pct)
select klant_id, locatie_id, tijdstip, artikel, groep, aantal,
       round(aantal * prijs / (1 + btw / 100), 2), medewerker, bon_ref || ':' || r, bon_ref, btw
from _reg
on conflict do nothing;

-- uren: doordeweeks 5 mensen, in het weekend 10, ongeveer 30% van de omzet
insert into uren (klant_id, locatie_id, datum, medewerker, gepland_uren, gewerkt_uren, kosten, bron_ref)
select l.klant_id, l.id, d::date, 'Demo-medewerker ' || m, 6, round((6 + random() * 1.2)::numeric, 2),
       round(((6 + random() * 1.2) * 24)::numeric, 2), 'demo-' || d::date || '-' || m
from (select id, klant_id from locaties where klant_id = (select id from klanten order by aangemaakt, id limit 1) order by aangemaakt, naam limit 4) l
cross join generate_series(current_date - 60, current_date - 1, interval '1 day') d
cross join lateral generate_series(1, case when extract(isodow from d) in (5,6,7) then 10 else 5 end) m
on conflict do nothing;

drop table if exists _art, _bon, _reg;

-- Opruimen (alleen als je de demodata weer weg wilt):
-- delete from verkoop where bron_ref like 'demo-%';
-- delete from bonnen  where bon_ref  like 'demo-%';
-- delete from uren    where bron_ref like 'demo-%';
