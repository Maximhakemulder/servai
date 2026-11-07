-- Alles wat op een factuur staat vastleggen: verpakking, artikelnummer, korting, btw en kopgegevens.
alter table factuur_regels add column if not exists artikelnummer          text;
alter table factuur_regels add column if not exists aantal_verpakkingen    numeric(12,3);
alter table factuur_regels add column if not exists verpakking_hoeveelheid  numeric(12,3);
alter table factuur_regels add column if not exists verpakking_eenheid      text;
alter table factuur_regels add column if not exists prijs_per_verpakking    numeric(12,4);
alter table factuur_regels add column if not exists korting_pct             numeric(6,2);
alter table factuur_regels add column if not exists btw_pct                 numeric(5,2);
alter table factuur_regels add column if not exists extra                   jsonb;
alter table facturen add column if not exists vervaldatum    date;
alter table facturen add column if not exists totaal_incl_btw numeric(12,2);
alter table facturen add column if not exists btw_totaal      numeric(12,2);
alter table facturen add column if not exists extra           jsonb;
notify pgrst, 'reload schema';
