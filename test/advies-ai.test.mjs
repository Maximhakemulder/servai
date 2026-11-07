import test from "node:test"; import assert from "node:assert/strict";
import { samenvatFeiten, normaliseerAdvies, perDag } from "../netlify/lib/advies-ai.mjs";
test("perDag telt locaties op", () => { const r = perDag([{ datum: "2026-11-02", omzet: 100 }, { datum: "2026-11-02", omzet: 50 }], "datum", ["omzet"]); assert.equal(r.length, 1); assert.equal(r[0].omzet, 150); assert.equal(r[0].wd, "ma"); });
test("samenvatFeiten: te weinig data en kostprijs%", () => {
  const f = samenvatFeiten({ klant: { loonnorm_pct: 28 }, omzet: [{ bedrijfsdag: "2026-11-02", omzet: 1000, bonnen: 50, couverts: 80 }], gerechten: [{ naam: "Burger", groep: "Hoofd", verkoopprijs: 18.9, kostprijs: 7.5 }] });
  assert.equal(f.heeft_data, false); assert.equal(f.loonnorm_pct, 28); assert.equal(f.hoogste_kostprijs_gerechten[0].kostprijs_pct, 43.3);
});
test("normaliseerAdvies: schoont op, weigert zonder cijfers", () => {
  const r = normaliseerAdvies([{ t: "warn", c: "Inkoop", h: "Bier +8%", x: "Van 1,20 naar 1,30", v: "inkoop", impact_eur_maand: 120 }, { t: "warn", c: "Omzet", h: "Vaag", x: "zonder getallen", v: "financien" }, { t: "x", h: "a", x: "1" }, { t: "info", c: "Onbekend", h: "Kans", x: "3 dagen", v: "nep" }]);
  assert.equal(r.length, 2); assert.equal(r[0].ai, true); assert.equal(r[1].c, "Omzet"); assert.equal(r[1].v, "overzicht");
});
import { uurProfiel, trendPer } from "../netlify/lib/advies-ai.mjs";
test("uurProfiel: aandeel drukste uren per weekdag", () => {
  const r = uurProfiel([{ bedrijfsdag: "2026-11-02", uur: 12, omzet: 400 }, { bedrijfsdag: "2026-11-02", uur: 18, omzet: 100 }, { bedrijfsdag: "2026-10-26", uur: 12, omzet: 400 }, { bedrijfsdag: "2026-10-26", uur: 18, omzet: 100 }]);
  assert.equal(r[0].wd, "ma"); assert.equal(r[0].drukste_uren[0].uur, 12); assert.equal(r[0].drukste_uren[0].aandeel_pct, 80);
});
test("trendPer: laatste 28 dagen tegenover de 28 ervoor", () => {
  const r = trendPer([{ bedrijfsdag: "2026-11-01", groep: "Bier", omzet: 150, aantal: 50 }, { bedrijfsdag: "2026-10-01", groep: "Bier", omzet: 100, aantal: 40 }], "groep", "2026-11-06", 5);
  assert.equal(r[0].verschil_pct, 50);
});
import { kostenEur } from "../netlify/lib/ai-kosten.mjs";
test("kostenEur: Haiku 10k in + 1k uit", () => { const k = kostenEur("claude-haiku-5-5", 10000, 1000); assert.ok(k > 0.013 && k < 0.015); });
test("kostenEur: onbekend model rekent met Sonnet-prijs", () => assert.ok(kostenEur("x", 1e6, 0) > 2.5));
test("normaliseerAdvies: bagatelgrens, sortering op impact", () => {
  const r = normaliseerAdvies([{ t: "warn", c: "Inkoop", h: "Klein", x: "0,3 cent", v: "inkoop", impact_eur_maand: 5 }, { t: "info", c: "Omzet", h: "Middel", x: "30 euro", v: "financien", impact_eur_maand: 200 }, { t: "warn", c: "Personeel", h: "Groot", x: "5 uur", v: "rooster", impact_eur_maand: 900 }, { t: "goed", c: "Omzet", h: "Goed", x: "+4%", v: "financien" }], { bagatel: 75 });
  assert.deepEqual(r.map((i) => i.h), ["Groot", "Middel", "Goed"]);
});
import { ruimte, factorVoor } from "../netlify/lib/ai-kosten.mjs";
const nepGet = (data) => async (p) => p.startsWith("ai_tarief") ? data.tarief : p.startsWith("ai_instellingen") ? data.inst : p.startsWith("ai_gebruik") ? data.gebruik : [];
test("factorVoor: standaard 4, eigen factor wint", async () => {
  assert.equal(await factorVoor(nepGet({ tarief: [{ sleutel: "standaard", factor: 4 }] }), "k1"), 4);
  assert.equal(await factorVoor(nepGet({ tarief: [{ sleutel: "standaard", factor: 4 }, { sleutel: "k1", factor: 3 }] }), "k1"), 3);
});
test("ruimte: cap geldt voor doorberekende kosten (echt x factor)", async () => {
  const g = (kosten, cap) => nepGet({ tarief: [{ sleutel: "standaard", factor: 4 }], inst: cap === undefined ? [] : [{ maand_cap_eur: cap }], gebruik: [{ kosten_eur: kosten }] });
  assert.equal(await ruimte(g(5, 25), "k1"), true);     // 5 x 4 = 20 < 25
  assert.equal(await ruimte(g(7, 25), "k1"), false);    // 28 >= 25
  assert.equal(await ruimte(g(0, 0), "k1"), false);     // cap 0 = AI uit
});
