import test from "node:test";
import assert from "node:assert/strict";
import { detecteer, parseDatum, parseGetal, parseUren, bouwRijen } from "../beheer/kolommen.mjs";
import { normaliseerInkoop } from "../netlify/lib/inkoop.mjs";
import { normaliseer } from "../netlify/lib/kassa.mjs";

test("datums in verschillende notaties", () => {
  assert.equal(parseDatum("2026-11-01"), "2026-11-01");
  assert.equal(parseDatum("1-11-2026"), "2026-11-01");
  assert.equal(parseDatum("01/11/26"), "2026-11-01");
  assert.equal(parseDatum("01.11.2026"), "2026-11-01");
  assert.equal(parseDatum("46327"), "2026-11-01");
  assert.equal(parseDatum("31-02-2026"), null);
  assert.equal(parseDatum("morgen"), null);
});
test("getallen en uren", () => {
  assert.equal(parseGetal("1.234,56"), 1234.56);
  assert.equal(parseGetal("€ 12,50"), 12.5);
  assert.equal(parseGetal("12.5"), 12.5);
  assert.equal(parseGetal("1,234.50"), 1234.5);
  assert.equal(parseGetal("1.234"), 1234);
  assert.equal(parseGetal("(5,00)"), -5);
  assert.equal(parseGetal("abc"), null);
  assert.equal(parseUren("8:30"), 8.5);
  assert.equal(parseUren("7,25"), 7.25);
});
test("kolommen worden herkend", () => {
  const u = detecteer(["Datum", "Medewerker", "Gewerkte uren", "Uurloon"], "uren");
  assert.deepEqual([u.datum, u.medewerker, u.uren, u.uurloon, u.begin], [0, 1, 2, 3, -1]);
  const i = detecteer(["Factuurdatum", "Leverancier", "Omschrijving", "Aantal", "Bedrag excl. btw", "Factuurnummer"], "inkoop");
  assert.deepEqual([i.datum, i.leverancier, i.omschrijving, i.aantal, i.bedrag, i.factuur], [0, 1, 2, 3, 4, 5]);
});
test("gewerkte uren met begin/eind, pauze, uurloon en meerdere diensten op één dag", () => {
  const kol = detecteer(["Datum", "Naam", "Begin", "Eind", "Pauze"], "uren");
  const r = bouwRijen([
    ["01-11-2026", "Sanne", "17:00", "01:00", "0:30"],   // nachtdienst: 8u - 0,5u = 7,5u
    ["01-11-2026", "Sanne", "10:00", "12:00", ""],       // tweede dienst: 2u
    ["02-11-2026", "Tom", "12:00", "20:00", "30"],       // pauze in minuten
    ["", "", "", "", ""],                                  // lege regel
    ["x", "Tom", "12:00", "20:00", ""],                    // kapotte datum
  ], kol, "gewerkt", { uurloon: 15 });
  assert.equal(r.rijen.length, 2);
  assert.equal(r.leeg, 1);
  assert.equal(r.fouten.length, 1);
  const s = r.rijen.find((x) => x.medewerker === "Sanne");
  assert.equal(s.gewerkt, 9.5);
  assert.equal(s.kosten, 142.5);
  assert.equal(r.rijen.find((x) => x.medewerker === "Tom").gewerkt, 7.5);
});
test("rooster levert alleen geplande uren, zonder kosten", () => {
  const kol = detecteer(["Datum", "Medewerker", "Uren"], "uren");
  const r = bouwRijen([["2026-11-03", "Eva", "6"]], kol, "gepland");
  assert.deepEqual(r.rijen, [{ datum: "2026-11-03", medewerker: "Eva", gepland: 6 }]);
});
test("uren gaan door de standaard controle van de kassa-module", () => {
  const kol = detecteer(["Datum", "Medewerker", "Uren", "Loonkosten"], "uren");
  const r = bouwRijen([["2026-11-03", "Eva", "6", "€ 120,00"]], kol, "gewerkt");
  const n = normaliseer({ uren: r.rijen }, { klant_id: "k", locatie_id: "l" });
  assert.equal(n.fouten.length, 0);
  assert.equal(n.uren[0].gewerkt_uren, 6);
  assert.equal(n.uren[0].kosten, 120);
});
test("inkoop: herkennen, en dezelfde upload geeft dezelfde sleutels", () => {
  const kol = detecteer(["Datum", "Leverancier", "Omschrijving", "Bedrag"], "inkoop");
  const rijen = [["03-11-2026", "Hanos", "Friet 10kg", "1.250,00"], ["03-11-2026", "Hanos", "Friet 10kg", "1.250,00"], ["03-11-2026", "", "x", "1"]];
  const r = bouwRijen(rijen, kol, "inkoop");
  assert.equal(r.rijen.length, 2);
  assert.equal(r.fouten.length, 1);
  assert.equal(r.rijen[0].bedrag, 1250);
  const a = normaliseerInkoop(r.rijen, { klant_id: "k", locatie_id: "l" }), b = normaliseerInkoop(r.rijen, { klant_id: "k", locatie_id: "l" });
  assert.equal(a.fouten.length, 0);
  assert.deepEqual(a.rijen.map((x) => x.bron_ref), b.rijen.map((x) => x.bron_ref));
  assert.notEqual(a.rijen[0].bron_ref, a.rijen[1].bron_ref);
});
