-- SERVAI · facturen schaalbaar: wachtrij met claim (bezig), pogingen, en onthouden tot waar de mailbox gelezen is.
alter table facturen add column if not exists pogingen int not null default 0;
alter table facturen add column if not exists bezig_sinds timestamptz;
alter table facturen drop constraint if exists facturen_status_check;
alter table facturen add constraint facturen_status_check check (status in ('ontvangen','bezig','verwerkt','fout','niet_gekoppeld'));
create index if not exists facturen_wachtrij on facturen(ontvangen) where status in ('ontvangen','bezig');

create table if not exists factuur_mailstatus (
  id          int primary key default 1 check (id = 1),
  uidvalidity bigint,
  laatste_uid bigint not null default 0,
  bijgewerkt  timestamptz not null default now()
);
insert into factuur_mailstatus (id) values (1) on conflict do nothing;
alter table factuur_mailstatus enable row level security;   -- geen policies: alleen de server (service key) leest dit
grant all on factuur_mailstatus to service_role;
