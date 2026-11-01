-- Voer dit pas uit NADAT je jezelf en de eigenaar hebt aangemaakt onder Authentication > Users.
-- Vervang de waarden tussen << >> door de echte gegevens (kopieer het User UID uit Supabase).

-- 1. Jij als platformbeheerder
insert into platform_beheerders (user_id) values ('<<JOUW-USER-UID>>');

-- 2. De eerste klant en zijn locaties
with k as (
  insert into klanten (naam, loonnorm_pct) values ('<<Naam van de klant>>', 30) returning id
)
insert into locaties (klant_id, naam)
select k.id, l from k, unnest(array['<<Locatie 1>>','<<Locatie 2>>']) as l;

-- 3. De eigenaar van de klant (zijn User UID uit Authentication > Users)
insert into profielen (id, klant_id, naam, email, rol, toegang)
select '<<UID-VAN-DE-EIGENAAR>>', id, '<<Naam eigenaar>>', '<<mail eigenaar>>', 'eigenaar',
       array['overzicht','financien','menu','dranken','kansen','personeel','upselling','reserveringen','inkoop','gasten','assistent','meldingen','advies','koppelingen','gebruikers','support']
from klanten where naam = '<<Naam van de klant>>';
