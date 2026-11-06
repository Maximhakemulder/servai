-- SERVAI · AI-adviezen: elke nacht per klant gemaakt uit samengevatte kassa-, rooster-, reserverings-, inkoop- en weerdata.
create table if not exists ai_adviezen (
  klant_id   uuid not null references klanten(id) on delete cascade,
  datum      date not null,
  items      jsonb not null default '[]',   -- [{t,c,h,x,a,v}] zelfde vorm als de adviezen in het dashboard
  model      text,
  gemaakt    timestamptz not null default now(),
  primary key (klant_id, datum)
);
alter table ai_adviezen enable row level security;
drop policy if exists ai_adviezen_lezen on ai_adviezen;
create policy ai_adviezen_lezen on ai_adviezen for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
grant select on ai_adviezen to authenticated;
grant all on ai_adviezen to service_role;
