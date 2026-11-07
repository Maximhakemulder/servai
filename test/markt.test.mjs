import test from "node:test";
import assert from "node:assert";
import { parseMarkt, verschilPct } from "../netlify/lib/markt.mjs";
const J = (o) => JSON.stringify({ gevonden: true, product_op_site: "Champignons 3 kg", pakprijs: 13.5, pak_hoeveelheid: 3, pak_eenheid: "kg", btw_inbegrepen: false, btw_pct: 9, bron_naam: "Visvleesvers", bron_url: "https://visvleesvers.nl/x", zekerheid: "hoog", ...o });
test("parseMarkt rekent pakprijs zelf om naar prijs per eenheid", () => {
  const a = parseMarkt(J({}), "kg");
  assert.equal(a.prijs, 4.5);                                  // € 13,50 voor 3 kg = € 4,50 per kg, geen 4,14
  assert.match(a.toelichting, /^Pak: Champignons 3 kg, € 13,50 per 3 kg excl\. btw/);
  assert.ok(Math.abs(parseMarkt(J({ btw_inbegrepen: true }), "kg").prijs - 4.13) < 0.01);   // 13,50 / 1,09 / 3
  assert.equal(parseMarkt(J({ pak_hoeveelheid: 500, pak_eenheid: "g", pakprijs: 2.5 }), "kg").prijs, 5);
  assert.equal(parseMarkt(J({}), "stuk"), null);                // kg-pak vergelijken met stuk-prijs: niet doen
  assert.equal(parseMarkt(J({}), "verpakking").zekerheid, "middel");
});
test("parseMarkt: onzin, niet gevonden, onbekende eenheid, onveilige url", () => {
  assert.equal(parseMarkt('{"gevonden":false}', "kg"), null);
  assert.equal(parseMarkt("geen json", "kg"), null);
  assert.equal(parseMarkt(J({ pak_eenheid: "emmer" }), "kg"), null);
  assert.equal(parseMarkt(J({ bron_url: "javascript:x" }), "kg").bron_url, null);
});
test("verschilPct", () => { assert.equal(verschilPct(11, 10), 10); assert.equal(verschilPct(9, 10), -10); assert.equal(verschilPct(0, 10), null); });
