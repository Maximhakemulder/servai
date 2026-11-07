-- Klant mag eigen facturen verwijderen (eigenaar, bedrijfsleider, boekhouder). Regels en prijswijzigingen verdwijnen mee.
grant delete on facturen to authenticated;
grant delete on factuur_regels to authenticated;

drop policy if exists facturen_verwijderen on facturen;
create policy facturen_verwijderen on facturen for delete to authenticated
  using (is_beheerder() or (klant_id = huidige_klant() and huidige_rol() in ('eigenaar','bedrijfsleider','boekhouder')));

drop policy if exists facturen_bestanden_verwijderen on storage.objects;
create policy facturen_bestanden_verwijderen on storage.objects for delete to authenticated
  using (bucket_id = 'facturen' and (is_beheerder() or ((storage.foldername(name))[1] = huidige_klant()::text and huidige_rol() in ('eigenaar','bedrijfsleider','boekhouder'))));
