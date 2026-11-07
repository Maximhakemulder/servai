-- SERVAI · AI-tarief: wat SERVAI echt aan AI betaalt blijft intern; de klant ziet de doorberekende prijs (echte kosten x factor).
create table if not exists ai_tarief (
  sleutel text primary key,                       -- 'standaard' of een klant-id (eigen factor voor die klant)
  factor  numeric(6,2) not null check (factor >= 1)
);
insert into ai_tarief (sleutel, factor) values ('standaard', 4) on conflict do nothing;
alter table ai_tarief enable row level security;
drop policy if exists ai_tarief_beheer on ai_tarief;
create policy ai_tarief_beheer on ai_tarief for all to authenticated using (is_beheerder()) with check (is_beheerder());
grant select, insert, update, delete on ai_tarief to authenticated;
grant all on ai_tarief to service_role;

-- klanten mogen de echte kosten niet meer lezen
drop policy if exists ai_gebruik_lezen on ai_gebruik;
create policy ai_gebruik_lezen on ai_gebruik for select to authenticated using (is_beheerder());

-- wat de klant wel ziet: doorberekende bedragen per soort, alleen van de eigen klant (of van elke klant voor beheerders)
create or replace function ai_kosten_klant(p_klant uuid default null, p_maand date default null)
returns table (soort text, aanroepen bigint, kosten numeric)
language sql security definer set search_path = public stable as $$
  with k as (select coalesce(p_klant, huidige_klant()) as id),
       f as (select coalesce((select factor from ai_tarief where sleutel = (select id::text from k)), (select factor from ai_tarief where sleutel = 'standaard'), 4) as x)
  select g.soort, count(*), round(sum(g.kosten_eur) * (select x from f), 2)
  from ai_gebruik g, k
  where g.klant_id = k.id and (is_beheerder() or k.id = huidige_klant())
    and date_trunc('month', g.gemaakt at time zone 'Europe/Amsterdam')::date = date_trunc('month', coalesce(p_maand, (now() at time zone 'Europe/Amsterdam')::date))::date
  group by g.soort
$$;
revoke all on function ai_kosten_klant(uuid, date) from public;
grant execute on function ai_kosten_klant(uuid, date) to authenticated, service_role;
