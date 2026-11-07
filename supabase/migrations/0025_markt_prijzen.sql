-- Marktprijzen per product (AI zoekt webprijzen bij groothandels). Gedeeld tussen klanten: het zijn openbare prijzen.
create table if not exists markt_prijzen (
  id           bigint generated always as identity primary key,
  sleutel      text not null,
  eenheid      text not null,
  omschrijving text,
  prijs        numeric(12,4),                      -- per eenheid, excl. btw
  bron_naam    text,
  bron_url     text,
  zekerheid    text check (zekerheid in ('hoog','middel','laag')),
  toelichting  text,
  gemeten      timestamptz not null default now(),
  unique (sleutel, eenheid)
);
alter table markt_prijzen enable row level security;
drop policy if exists markt_prijzen_lezen on markt_prijzen;
create policy markt_prijzen_lezen on markt_prijzen for select to authenticated using (true);
grant select on markt_prijzen to authenticated;
grant all on markt_prijzen to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
notify pgrst, 'reload schema';
