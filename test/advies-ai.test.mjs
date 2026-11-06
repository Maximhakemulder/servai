import test from "node:test"; import assert from "node:assert/strict";
import { samenvatFeiten, normaliseerAdvies, perDag } from "../netlify/lib/advies-ai.mjs";
test("perDag telt locaties op", () => { const r = perDag([{ datum: "2026-11-02", omzet: 100 }, { datum: "2026-11-02", omzet: 50 }], "datum", ["omzet"]); assert.equal(r.length, 1); assert.equal(r[0].omzet, 150); assert.equal(r[0].wd, "ma"); });
test("samenvatFeiten: te weinig data en kostprijs%", () => {
  const f = samenvatFeiten({ klant: { loonnorm_pct: 28 }, omzet: [{ bedrijfsdag: "2026-11-02", omzet: 1000, bonnen: 50, couverts: 80 }], gerechten: [{ naam: "Burger", groep: "Hoofd", verkoopprijs: 18.9, kostprijs: 7.5 }] });
  assert.equal(f.heeft_data, false); assert.equal(f.loonnorm_pct, 28); assert.equal(f.hoogste_kostprijs_gerechten[0].kostprijs_pct, 43.3);
});
test("normaliseerAdvies: schoont op, weigert zonder cijfers", () => {
  const r = normaliseerAdvies([{ t: "warn", c: "Inkoop", h: "Bier +8%", x: "Van 1,20 naar 1,30", v: "inkoop" }, { t: "warn", c: "Omzet", h: "Vaag", x: "zonder getallen", v: "financien" }, { t: "x", h: "a", x: "1" }, { t: "info", c: "Onbekend", h: "Kans", x: "3 dagen", v: "nep" }]);
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
