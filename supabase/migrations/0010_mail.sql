-- B2B verkoop vanuit /beheer: leads, mailteksten, instellingen en een logboek van verzonden mails.
-- Alleen platformbeheerders hebben toegang; versturen doet de mailer (serverfuncties).
create table if not exists mail_contacten (
  id            uuid primary key default gen_random_uuid(),
  naam          text,
  bedrijf       text,
  email         text not null unique,                  -- altijd kleine letters
  plaats        text,
  soort         text,
  website       text,
  telefoon      text,
  openingszin   text,                    -- persoonlijke eerste zin voor de mail ({{openingszin}})
  bron          text not null default 'handmatig',
  status        text not null default 'te_keuren' check (status in ('te_keuren','wachtrij','gemaild','opgevolgd','afspraak','klant','overgeslagen','afgemeld','fout')),
  notitie       text,
  gereageerd    boolean not null default false,
  afgemeld      boolean not null default false,
  afmeld_token  uuid not null default gen_random_uuid(),
  eerste_mail_op timestamptz,
  opvolg_mail_op timestamptz,
  geklikt_op    timestamptz,
  fout          text,
  aangemaakt    timestamptz not null default now()
);
create unique index if not exists mail_contacten_token on mail_contacten (afmeld_token);
create index if not exists mail_contacten_status on mail_contacten (status);

create table if not exists mail_sjablonen (
  id         uuid primary key default gen_random_uuid(),
  soort      text not null default 'eerste' check (soort in ('eerste','opvolg')),
  naam       text not null,
  onderwerp  text not null,
  tekst      text not null,
  aangemaakt timestamptz not null default now()
);

create table if not exists mail_verzonden (
  id         bigint generated always as identity primary key,
  contact_id uuid references mail_contacten(id) on delete set null,
  type       text not null default 'eerste' check (type in ('eerste','opvolg','test')),
  aan        text not null,
  onderwerp  text not null,
  status     text not null check (status in ('verstuurd','fout')),
  fout       text,
  resend_id  text,
  afgeleverd_op timestamptz,
  geopend_op timestamptz,
  geklikt_op timestamptz,
  bounce_op  timestamptz,
  klacht_op  timestamptz,
  aangemaakt timestamptz not null default now()
);
create index if not exists mail_verzonden_contact on mail_verzonden(contact_id, aangemaakt desc);
create index if not exists mail_verzonden_resend on mail_verzonden(resend_id);

create table if not exists mail_instellingen (
  id            int primary key default 1 check (id = 1),
  aan           boolean not null default false,        -- mailer staat standaard uit
  daglimiet     int not null default 50 check (daglimiet between 0 and 500),
  per_uur       int not null default 12 check (per_uur between 1 and 100),
  van_uur       int not null default 8 check (van_uur between 0 and 23),
  tot_uur       int not null default 17 check (tot_uur between 1 and 24),
  alleen_werkdagen boolean not null default true,
  opvolgen      boolean not null default true,
  opvolg_na_dagen int not null default 4 check (opvolg_na_dagen between 1 and 60),
  eerste_sjabloon_id uuid references mail_sjablonen(id) on delete set null,
  opvolg_sjabloon_id uuid references mail_sjablonen(id) on delete set null,
  demo_url      text not null default 'https://servai.nl/demo/'
);
insert into mail_instellingen (id) values (1) on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['mail_contacten','mail_sjablonen','mail_verzonden','mail_instellingen'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_beheer', t);
    execute format('create policy %I on %I for all to authenticated using (is_beheerder()) with check (is_beheerder())', t || '_beheer', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;
