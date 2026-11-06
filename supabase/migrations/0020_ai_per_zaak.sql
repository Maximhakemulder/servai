-- SERVAI · AI-gebruik en AI-adviezen per zaak (locatie), zodat kosten per zaak te zien en door te rekenen zijn.
alter table ai_gebruik add column if not exists locatie_id uuid references locaties(id) on delete set null;   -- leeg = op klantniveau (bijv. facturen)
create index if not exists ai_gebruik_tijd on ai_gebruik(gemaakt desc);

delete from ai_adviezen;                       -- nog leeg of oude klantbrede adviezen: worden opnieuw per zaak gemaakt
alter table ai_adviezen add column if not exists locatie_id uuid references locaties(id) on delete cascade;
alter table ai_adviezen alter column locatie_id set not null;
alter table ai_adviezen drop constraint if exists ai_adviezen_pkey;
alter table ai_adviezen add primary key (klant_id, locatie_id, datum);
drop policy if exists ai_adviezen_lezen on ai_adviezen;
create policy ai_adviezen_lezen on ai_adviezen for select to authenticated using (mag_zien(klant_id, locatie_id));
