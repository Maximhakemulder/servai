// SERVAI · marktprijs per product: AI zoekt op het web (Sligro, Hanos, Makro, Bidfood) en geeft een prijs per eenheid excl. btw. Altijd een schatting met bron.
export const verschilPct = (jouw, markt) => (jouw > 0 && markt > 0 ? Math.round(((jouw - markt) / markt) * 1000) / 10 : null);

/** Haalt het JSON-antwoord uit de tekst van het model (met of zonder codeblok). */
export function parseMarkt(tekst) {
  const m = /\{[\s\S]*\}/.exec(String(tekst || ""));
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const prijs = Number(String(j.prijs_excl_btw).replace(",", "."));
  if (!j.gevonden || !(prijs > 0) || prijs > 100000) return null;
  const zekerheid = ["hoog", "middel", "laag"].includes(j.zekerheid) ? j.zekerheid : "laag";
  const url = /^https?:\/\//i.test(j.bron_url || "") ? String(j.bron_url).slice(0, 400) : null;
  return { prijs: Math.round(prijs * 10000) / 10000, zekerheid, bron_naam: String(j.bron_naam || "").slice(0, 80) || null, bron_url: url, toelichting: String(j.toelichting || "").slice(0, 240) || null };
}

const SYSTEEM = `Je zoekt actuele inkoopprijzen voor Nederlandse horeca. Je krijgt een product zoals het op een inkoopfactuur staat. Zoek op het web de prijs van hetzelfde (of een vrijwel gelijk) product bij een Nederlandse groothandel voor horeca, zoals Sligro, Hanos, Makro of Bidfood, of een vergelijkbare landelijke leverancier.
Regels:
- Geef de prijs per dezelfde eenheid als op de factuur (kg, l, stuk of verpakking), excl. btw. Reken verpakkingen om als dat nodig is.
- Neem alleen een prijs die je echt op een pagina hebt gezien. Verzin niets. Vind je geen betrouwbare vergelijking, zet "gevonden" op false.
- zekerheid: "hoog" = hetzelfde product en dezelfde verpakking, "middel" = zeer vergelijkbaar, "laag" = grove schatting.
Antwoord uitsluitend met JSON, zonder uitleg eromheen:
{"gevonden":true|false,"prijs_excl_btw":number,"bron_naam":"Sligro","bron_url":"https://...","zekerheid":"hoog|middel|laag","toelichting":"kort: product en verpakking waarmee je vergeleek"}`;

export async function vraagMarkt({ omschrijving, eenheid, prijs, leverancier }, { apiKey, model, onUsage } = {}) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || "claude-haiku-5-5", max_tokens: 1200, system: SYSTEEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: `Product op de factuur: ${omschrijving}\nEenheid: ${eenheid}\nPrijs op de factuur per ${eenheid}: € ${prijs}${leverancier ? `\nLeverancier: ${leverancier}` : ""}` }] }),
  });
  if (!r.ok) throw new Error(`marktprijs mislukt (${r.status})`);
  const out = await r.json();
  if (onUsage) await onUsage(out.usage);
  const tekst = (out.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  return parseMarkt(tekst);
}
