-- SERVAI · klant ziet zijn eigen AI-kosten live en stelt zelf een maandcap in (nooit meer dan dat bedrag per maand).
create table if not exists ai_instellingen (
  klant_id      uuid primary key references klanten(id) on delete cascade,
  maand_cap_eur numeric(6,2) check (maand_cap_eur is null or maand_cap_eur >= 0),   -- leeg = standaardcap van SERVAI
  bijgewerkt    timestamptz not null default now()
);
alter table ai_instellingen enable row level security;
drop policy if exists ai_inst_lezen on ai_instellingen;
create policy ai_inst_lezen on ai_instellingen for select to authenticated using (is_beheerder() or klant_id = huidige_klant());
drop policy if exists ai_inst_schrijven on ai_instellingen;
create policy ai_inst_schrijven on ai_instellingen for insert to authenticated
  with check (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() in ('eigenaar','bedrijfsleider')));
drop policy if exists ai_inst_wijzigen on ai_instellingen;
create policy ai_inst_wijzigen on ai_instellingen for update to authenticated
  using (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() in ('eigenaar','bedrijfsleider')))
  with check (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() in ('eigenaar','bedrijfsleider')));
grant select, insert, update on ai_instellingen to authenticated;
grant all on ai_instellingen to service_role;

-- de klant mag zijn eigen gebruik zien (was alleen voor beheerders)
drop policy if exists ai_gebruik_lezen on ai_gebruik;
create policy ai_gebruik_lezen on ai_gebruik for select to authenticated using (is_beheerder() or klant_id = huidige_klant());

-- facturen die wachten omdat de AI-cap van de klant bereikt is
alter table facturen drop constraint if exists facturen_status_check;
alter table facturen add constraint facturen_status_check check (status in ('ontvangen','bezig','verwerkt','fout','niet_gekoppeld','gepauzeerd'));
