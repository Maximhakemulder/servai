-- Welke producten tellen als upsell (dessert, koffie, wijn per glas, bijgerecht, ...).
-- null = nog niet bevestigd (SERVAI doet een voorstel), true/false = bevestigd door de klant.
alter table menu_items add column if not exists upsell boolean;
