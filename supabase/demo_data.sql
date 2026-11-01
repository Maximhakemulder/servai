-- DEMODATA voor je eerste klant, zodat je de pagina Loonkosten kunt zien werken.
-- Voer dit uit NADAT seed_eerste_klant.sql gelukt is. Het maakt 60 dagen nepomzet en nepuren aan
-- voor alle locaties van de eerste klant. Verwijderen kan met het blokje onderaan.

insert into verkoop (klant_id, locatie_id, tijdstip, artikel, groep, aantal, bedrag, bron_ref)
select l.klant_id, l.id,
       (d::date + time '12:00' + (h * interval '1 hour')) at time zone 'Europe/Amsterdam',
       'Demo-omzet', case when h % 2 = 0 then 'keuken' else 'bar' end, 1,
       round((120 + 380 * random() * (case when extract(isodow from d) in (5,6,7) then 1.6 else 1 end))::numeric, 2),
       'demo-' || d::date || '-' || h
from (select id, klant_id from locaties order by aangemaakt limit 4) l
cross join generate_series(current_date - 60, current_date - 1, interval '1 day') d
cross join generate_series(0, 9) h
on conflict do nothing;

insert into uren (klant_id, locatie_id, datum, medewerker, gepland_uren, gewerkt_uren, kosten, bron_ref)
select l.klant_id, l.id, d::date, 'Demo-medewerker ' || m,
       8, 8 + (random() * 1.5)::numeric(4,2),
       round((8 + random() * 1.5) * 24)::numeric, 'demo-' || d::date || '-' || m
from (select id, klant_id from locaties order by aangemaakt limit 4) l
cross join generate_series(current_date - 60, current_date - 1, interval '1 day') d
cross join generate_series(1, 6) m
on conflict do nothing;

-- Opruimen (alleen als je de demodata weer weg wilt):
-- delete from verkoop where bron_ref like 'demo-%';
-- delete from uren    where bron_ref like 'demo-%';
