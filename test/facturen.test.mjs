import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL = "x"; process.env.SUPABASE_SERVICE_KEY = "y";
const { kiesKlant } = await import("../netlify/functions/facturen-inbox.mjs");
const klanten = [{ id: "k1", factuur_code: "ab12cd34" }, { id: "k2", factuur_code: "zz99" }];
const afz = [{ klant_id: "k2", email: "finance@bedrijf.nl" }];
test("kiest klant via plus-adres", () => assert.equal(kiesKlant({ aan: ["Facturen+ab12cd34@servai.nl"], van: "x@y.nl" }, klanten, afz), "k1"));
test("kiest klant via bekende afzender", () => assert.equal(kiesKlant({ aan: ["facturen@servai.nl"], van: "Finance@Bedrijf.nl" }, klanten, afz), "k2"));
test("onbekend geeft null", () => assert.equal(kiesKlant({ aan: ["facturen@servai.nl"], van: "spam@x.nl" }, klanten, afz), null));
const { categoriseer, koppelIngredient, normaliseerFactuur, sleutel } = await import("../netlify/lib/factuur-lezen.mjs");
test("categoriseert food, drank en overig", () => {
  assert.equal(categoriseer("Heineken fust 20L"), "drank");
  assert.equal(categoriseer("Rundergehakt 5kg"), "food");
  assert.equal(categoriseer("Afwasmiddel 10L"), "overig");
});
test("koppelt alleen bij gelijke eenheid", () => {
  const ing = [{ id: "a", naam: "Tomaat", eenheid: "kg" }, { id: "b", naam: "Friet", eenheid: "kg" }];
  const r = { sleutel: sleutel("Tomaten trostomaat 6kg"), eenheid: "kg", prijs_per_eenheid: 2.9, categorie: "food" };
  assert.equal(koppelIngredient({ ...r, sleutel: "tomaten trostomaat" }, ing).id, "a");
  assert.equal(koppelIngredient({ ...r, sleutel: "trostomaat tomaat", eenheid: "stuk" }, ing), null);
  assert.equal(koppelIngredient({ ...r, categorie: "overig", sleutel: "tomaat" }, ing), null);
});
test("normaliseert factuur met prijs uit bedrag/aantal", () => {
  const n = normaliseerFactuur({ leverancier: "Hanos", factuurdatum: "2026-11-02", regels: [{ omschrijving: "Friet 2,5kg", aantal: 4, eenheid: "KG", bedrag: 9 }, { omschrijving: "" }] }, "2026-11-05");
  assert.equal(n.regels.length, 1); assert.equal(n.regels[0].prijs_per_eenheid, 2.25); assert.equal(n.regels[0].eenheid, "kg"); assert.equal(n.regels[0].categorie, "food");
});
