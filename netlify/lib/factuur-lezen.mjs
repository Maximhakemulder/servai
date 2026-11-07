// SERVAI · factuur uitlezen (PDF/afbeelding → regels), categoriseren (food/drank/overig) en koppelen aan ingrediënten.
// Uitlezen gebeurt met Claude (ANTHROPIC_API_KEY); categoriseren en koppelen zijn gewone regels, zodat het te testen is.
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const sleutel = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b\d+([.,]\d+)?\s*(x|kg|gr?|l|cl|ml|st|stuks?|dozen|doos|fles(sen)?|krat(ten)?)\b/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const DRANK = /\b(bier|pils|pilsner|fust|wijn|wit|rood|ros[eé]|prosecco|champagne|cava|fris|cola|sprite|fanta|tonic|limonade|spa|water|sap|jus|koffie|espresso|thee|melk|gin|wodka|vodka|whisky|rum|likeur|jenever|cognac|aperol|cocktail|siroop|spirit\w*)\b/i;
const OVERIG = /\b(schoon\w*|reinig\w*|afwas\w*|zeep|servet\w*|verpakk\w*|bakje\w*|folie|afval\w*|huur|energie|gas|stroom|onderhoud|tafelkleed|bestek|statiegeld|transport|bezorg\w*|diensten?|verzekering|marketing|drukwerk|kaars\w*|handschoen\w*|zak\w*|doek\w*)\b/i;
/** Valt terug op regels als het uitlezen geen (geldige) categorie geeft. */
export function categoriseer(omschrijving) {
  const t = String(omschrijving || "");
  if (OVERIG.test(t)) return "overig";
  if (DRANK.test(t)) return "drank";
  return "food";
}
const EENH = { kg: "kg", kilo: "kg", gr: "kg", l: "l", liter: "l", st: "stuk", stuk: "stuk", stuks: "stuk", pst: "stuk" };
const eenheid = (e) => { const k = String(e || "").toLowerCase().trim(); return EENH[k] || (k ? k.slice(0, 20) : null); };

/** Maakt van het antwoord van de uitleesstap nette regels. */
export function normaliseerFactuur(j, standaardDatum) {
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(j && j.factuurdatum) ? j.factuurdatum : standaardDatum;
  const regels = [];
  for (const r of (j && j.regels) || []) {
    const omsch = String(r && r.omschrijving || "").trim().slice(0, 200);
    if (!omsch) continue;
    const aantal = Number(r.aantal), bedrag = Number(r.bedrag);
    let prijs = Number(r.prijs_per_eenheid);
    if (!(prijs > 0) && aantal > 0 && bedrag > 0) prijs = bedrag / aantal;
    regels.push({
      omschrijving: omsch, sleutel: sleutel(omsch) || omsch.toLowerCase().slice(0, 60),
      categorie: ["food", "drank", "overig"].includes(r.categorie) ? r.categorie : categoriseer(omsch),
      aantal: aantal > 0 ? aantal : null, eenheid: eenheid(r.eenheid),
      prijs_per_eenheid: prijs > 0 ? Math.round(prijs * 10000) / 10000 : null, bedrag: Number.isFinite(bedrag) ? r2(bedrag) : null,
    });
  }
  return { datum, leverancier: String(j && j.leverancier || "").trim().slice(0, 120) || null, factuurnummer: String(j && j.factuurnummer || "").trim().slice(0, 80) || null, totaal: Number(j && j.totaal_excl_btw) > 0 ? r2(j.totaal_excl_btw) : regels.reduce((s, r) => s + (r.bedrag || 0), 0) || null, regels };
}

/** Zoekt het ingrediënt bij een factuurregel: naam komt voor in de omschrijving én de eenheid is gelijk (anders geen prijs overnemen). */
const stam = (w) => { w = w.replace(/(.)\1/g, "$1"); return w.length > 4 ? w.replace(/(en|s)$/, "") : w; };
const stammen = (t) => sleutel(t).split(" ").filter(Boolean).map(stam);
export function koppelIngredient(regel, ingredienten) {
  if (!(regel.prijs_per_eenheid > 0) || !regel.eenheid || regel.categorie === "overig") return null;
  const rs = new Set(stammen(regel.sleutel));
  return ingredienten.filter((i) => { const t = stammen(i.naam); return eenheid(i.eenheid) === regel.eenheid && sleutel(i.naam).length >= 3 && t.length && t.every((x) => rs.has(x)); })
    .sort((a, b) => sleutel(b.naam).length - sleutel(a.naam).length)[0] || null;
}

const PROMPT = "Lees deze inkoopfactuur van een horecabedrijf. Geef leverancier, factuurnummer, factuurdatum (YYYY-MM-DD), totaal excl. btw en alle regels. Per regel: omschrijving, categorie (food = eten en ingrediënten, drank = alle dranken, overig = schoonmaak, verpakking, energie, diensten e.d.), aantal, eenheid (kg, l of stuk; reken een verpakking om naar kg, l of stuk als de inhoud duidelijk is, anders eenheid 'doos' of 'verpakking'), prijs_per_eenheid excl. btw en bedrag excl. btw. Verzin niets: laat onbekende velden weg.";
const SCHEMA = { type: "object", properties: { leverancier: { type: "string" }, factuurnummer: { type: "string" }, factuurdatum: { type: "string" }, totaal_excl_btw: { type: "number" }, regels: { type: "array", items: { type: "object", properties: { omschrijving: { type: "string" }, categorie: { type: "string", enum: ["food", "drank", "overig"] }, aantal: { type: "number" }, eenheid: { type: "string" }, prijs_per_eenheid: { type: "number" }, bedrag: { type: "number" } }, required: ["omschrijving", "categorie"] } } }, required: ["regels"] };

/** Stuurt de factuur naar Claude en geeft het ruwe resultaat terug. */
export async function leesFactuur(buffer, mime, { apiKey, model, onUsage } = {}) {
  const bron = { type: "base64", media_type: mime, data: Buffer.from(buffer).toString("base64") };
  const blok = mime === "application/pdf" ? { type: "document", source: bron } : { type: "image", source: bron };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || "claude-haiku-5-5", max_tokens: 16000, tools: [{ name: "factuur", description: "De gegevens van de factuur", input_schema: SCHEMA }], tool_choice: { type: "tool", name: "factuur" }, messages: [{ role: "user", content: [blok, { type: "text", text: PROMPT }] }] }),
  });
  if (!r.ok) throw new Error(`uitlezen mislukt (${r.status})`);
  const out = await r.json();
  if (onUsage) await onUsage(out.usage);
  const t = (out.content || []).find((c) => c.type === "tool_use");
  if (!t) throw new Error("geen resultaat bij uitlezen");
  if (out.stop_reason === "max_tokens") throw new Error("factuur te groot om in één keer uit te lezen");
  return t.input;
}
