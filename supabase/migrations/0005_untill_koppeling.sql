-- SERVAI · unTill-koppeling
-- Bewaart tot waar de laatste synchronisatie gekomen is, zodat elke run alleen nieuwe data ophaalt.
-- Veilig opnieuw uit te voeren.
alter table koppelingen add column if not exists sync_tot timestamptz;
create unique index if not exists koppelingen_locatie_systeem on koppelingen(locatie_id, systeem) where locatie_id is not null;
