-- SERVAI · AI-gebruik en -kosten per klant (alleen zichtbaar voor platformbeheerders).
create table if not exists ai_gebruik (
  id         bigint generated always as identity primary key,
  klant_id   uuid not null references klanten(id) on delete cascade,
  gemaakt    timestamptz not null default now(),
  soort      text not null,            -- advies, factuur, assistent
  model      text not null,
  tokens_in  int not null default 0,
  tokens_uit int not null default 0,
  kosten_eur numeric(10,5) not null default 0   -- schatting op basis van de prijslijst in de functie
);
create index if not exists ai_gebruik_klant_tijd on ai_gebruik(klant_id, gemaakt desc);
alter table ai_gebruik enable row level security;
drop policy if exists ai_gebruik_lezen on ai_gebruik;
create policy ai_gebruik_lezen on ai_gebruik for select to authenticated using (is_beheerder());
grant select on ai_gebruik to authenticated;
grant all on ai_gebruik to service_role;

create or replace view ai_kosten_maand with (security_invoker = true) as
select klant_id, date_trunc('month', gemaakt at time zone 'Europe/Amsterdam')::date as maand, soort,
       count(*) as aanroepen, sum(tokens_in) as tokens_in, sum(tokens_uit) as tokens_uit, round(sum(kosten_eur), 2) as kosten_eur
from ai_gebruik group by 1, 2, 3;
grant select on ai_kosten_maand to authenticated;
