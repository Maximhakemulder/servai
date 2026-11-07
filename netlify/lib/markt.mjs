// SERVAI · marktprijs per product: AI zoekt op het web (Sligro, Hanos, Makro, Bidfood) en geeft een prijs per eenheid excl. btw. Altijd een schatting met bron.
export const verschilPct = (jouw, markt) => (jouw > 0 && markt > 0 ? Math.round(((jouw - markt) / markt) * 1000) / 10 : null);

const num = (x) => Number(String(x).replace(",", "."));
const nl2 = (n) => n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const OMREKEN = { g: ["kg", 0.001], gr: ["kg", 0.001], gram: ["kg", 0.001], kg: ["kg", 1], kilo: ["kg", 1], ml: ["l", 0.001], cl: ["l", 0.01], l: ["l", 1], liter: ["l", 1], stuk: ["stuk", 1], stuks: ["stuk", 1], st: ["stuk", 1] };

/** Haalt het JSON-antwoord uit de tekst van het model en rekent zelf de prijs per eenheid uit (het model levert de pakprijs, wij de deling en btw). */
export function parseMarkt(tekst, eenheid) {
  const m = /\{[\s\S]*\}/.exec(String(tekst || ""));
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const pak = num(j.pakprijs), hoev = num(j.pak_hoeveelheid), pct = [0, 6, 9, 21].includes(num(j.btw_pct)) ? num(j.btw_pct) : 9;
  if (!j.gevonden || !(pak > 0) || !(hoev > 0) || pak > 100000) return null;
  const pe = OMREKEN[String(j.pak_eenheid || "").toLowerCase().trim()];
  if (!pe) return null;
  const excl = j.btw_inbegrepen ? pak / (1 + pct / 100) : pak;
  const inPak = hoev * pe[1], doel = String(eenheid || "").toLowerCase();
  let prijs, zekerheid = ["hoog", "middel", "laag"].includes(j.zekerheid) ? j.zekerheid : "laag";
  if (doel === pe[0]) prijs = excl / inPak;                                    // zelfde grootheid: prijs per kg, l of stuk
  else if (doel === "verpakking") { prijs = excl; if (zekerheid === "hoog") zekerheid = "middel"; }   // prijs per verpakking zoals de winkel het verkoopt
  else return null;
  if (!(prijs > 0)) return null;
  const url = /^https?:\/\//i.test(j.bron_url || "") ? String(j.bron_url).slice(0, 400) : null;
  const uitleg = `Pak: ${String(j.product_op_site || "").slice(0, 80) || "product"}, € ${nl2(pak)} per ${hoev} ${j.pak_eenheid}${j.btw_inbegrepen ? ` incl. ${pct}% btw` : " excl. btw"}`;
  return { prijs: Math.round(prijs * 10000) / 10000, zekerheid, bron_naam: String(j.bron_naam || "").slice(0, 80) || null, bron_url: url, toelichting: uitleg.slice(0, 240) };
}

const SYSTEEM = `Je zoekt actuele inkoopprijzen voor Nederlandse horeca. Je krijgt een product zoals het op een inkoopfactuur staat. Zoek op het web hetzelfde (of een vrijwel gelijk) product bij een Nederlandse groothandel of vakleverancier voor horeca, zoals Sligro, Hanos, Makro, Bidfood of een gespecialiseerde leverancier (vlees, vis, groente).
Regels:
- Geef de prijs zoals die op de pagina staat: de prijs van het verkochte pak of de verkochte verpakking, met de hoeveelheid daarin. Reken zelf NIETS om; dat doen wij.
- Neem alleen een prijs die je echt op een productpagina hebt gezien, voor een product dat dezelfde soort en vergelijkbare kwaliteit is. Verzin niets. Twijfel je of de prijs bij dit product hoort, zet "gevonden" op false.
- Geef aan of de getoonde prijs inclusief btw is (webshops voor consumenten vaak wel, groothandels vaak niet) en welk btw-percentage geldt (9 voor voedsel, 21 voor alcohol).
- zekerheid: "hoog" = hetzelfde product en dezelfde verpakking, "middel" = zeer vergelijkbaar, "laag" = grove schatting.
Antwoord uitsluitend met JSON, zonder uitleg eromheen:
{"gevonden":true|false,"product_op_site":"naam zoals op de pagina","pakprijs":number,"pak_hoeveelheid":number,"pak_eenheid":"kg|g|l|ml|cl|stuk","btw_inbegrepen":true|false,"btw_pct":9,"bron_naam":"Sligro","bron_url":"https://...","zekerheid":"hoog|middel|laag"}`;

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
  return parseMarkt(tekst, eenheid);
}
