-- SERVAI · de server (service_role) mist rechten op de factuurtabellen; zonder deze grants kan er geen factuur worden opgeslagen.
grant all on facturen, factuur_regels, factuur_afzenders to service_role;
grant select on factuur_prijswijzigingen to service_role;
grant usage, select on all sequences in schema public to service_role;
