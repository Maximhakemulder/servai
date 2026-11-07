import test from "node:test";
import assert from "node:assert";
import { parseMarkt, verschilPct } from "../netlify/lib/markt.mjs";
test("parseMarkt: JSON in codeblok, onzin en niet gevonden", () => {
  const m = parseMarkt('Hier:\n```json\n{"gevonden":true,"prijs_excl_btw":"14,5","bron_naam":"Sligro","bron_url":"https://sligro.nl/x","zekerheid":"hoog","toelichting":"zak 10 kg"}\n```');
  assert.equal(m.prijs, 14.5);                             // komma-decimaal als tekst wordt ook begrepen
  const g = parseMarkt('{"gevonden":true,"prijs_excl_btw":14.5,"bron_naam":"Sligro","bron_url":"https://sligro.nl/x","zekerheid":"hoog","toelichting":"zak 10 kg"}');
  assert.deepEqual([g.prijs, g.zekerheid, g.bron_naam], [14.5, "hoog", "Sligro"]);
  assert.equal(parseMarkt('{"gevonden":false}'), null);
  assert.equal(parseMarkt("geen json"), null);
  assert.equal(parseMarkt('{"gevonden":true,"prijs_excl_btw":5,"bron_url":"javascript:x","zekerheid":"raar"}').bron_url, null);
});
test("verschilPct", () => { assert.equal(verschilPct(11, 10), 10); assert.equal(verschilPct(9, 10), -10); assert.equal(verschilPct(0, 10), null); });
