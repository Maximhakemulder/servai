-- Facturen die de finance-afdeling van een klant naar de SERVAI-factuurmailbox stuurt.
-- Bewaartermijn: de PDF 12 maanden (daarna wist de functie het bestand), gegevens blijven.
alter table klanten add column if not exists factuur_code text unique default substr(replace(gen_random_uuid()::text,'-',''),1,8);
update klanten set factuur_code = substr(replace(gen_random_uuid()::text,'-',''),1,8) where factuur_code is null;

create table if not exists factuur_afzenders (          -- adressen van de klant die facturen mogen sturen
  id        uuid primary key default gen_random_uuid(),
  klant_id  uuid not null references klanten(id) on delete cascade,
  email     text not null unique,                       -- kleine letters
  aangemaakt timestamptz not null default now()
);

create table if not exists facturen (
  id          uuid primary key default gen_random_uuid(),
  klant_id    uuid references klanten(id) on delete cascade,   -- leeg = nog niet gekoppeld aan een klant
  ontvangen   timestamptz not null default now(),
  van         text,
  onderwerp   text,
  bestandsnaam text,
  bijlage_pad text,                                     -- pad in opslag (bucket facturen); leeg na 12 maanden
  grootte     int,
  message_id  text unique,
  status      text not null default 'ontvangen' check (status in ('ontvangen','verwerkt','fout','niet_gekoppeld')),
  leverancier text,
  factuurdatum date,
  bedrag      numeric(12,2)
);
create index if not exists facturen_klant on facturen(klant_id, ontvangen desc);

alter table facturen enable row level security;
alter table factuur_afzenders enable row level security;
drop policy if exists facturen_lezen on facturen;
create policy facturen_lezen on facturen for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
drop policy if exists afzenders_lezen on factuur_afzenders;
create policy afzenders_lezen on factuur_afzenders for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
grant select on facturen, factuur_afzenders to authenticated;

insert into storage.buckets (id, name, public) values ('facturen','facturen',false) on conflict (id) do nothing;

drop policy if exists facturen_bestanden_lezen on storage.objects;
create policy facturen_bestanden_lezen on storage.objects for select to authenticated
  using (bucket_id = 'facturen' and (is_beheerder() or (storage.foldername(name))[1] = huidige_klant()::text));
