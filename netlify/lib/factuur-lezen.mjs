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
const GEW = { kg: ["kg", 1], kilo: ["kg", 1], g: ["kg", 0.001], gr: ["kg", 0.001], gram: ["kg", 0.001], l: ["l", 1], liter: ["l", 1], cl: ["l", 0.01], ml: ["l", 0.001], stuk: ["stuk", 1], stuks: ["stuk", 1], st: ["stuk", 1] };
const inhoud = (h, e) => { const n = Number(h), g = GEW[String(e || "").toLowerCase().trim()]; return n > 0 && g ? { eenheid: g[0], hoev: n * g[1] } : null; };
const pos = (x) => (Number(x) > 0 ? Number(x) : null);
const tekst = (x, n) => String(x == null ? "" : x).trim().slice(0, n) || null;
const isoDatum = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

export function normaliseerFactuur(j, standaardDatum) {
  const datum = isoDatum(j && j.factuurdatum) || standaardDatum;
  const regels = [];
  for (const r of (j && j.regels) || []) {
    const omsch = String(r && r.omschrijving || "").trim().slice(0, 200);
    if (!omsch) continue;
    const bedrag = Number(r.bedrag), korting = Number(r.korting_pct);
    const aantalV = pos(r.aantal_verpakkingen) || pos(r.aantal);
    let ppv = pos(r.prijs_per_verpakking) || pos(r.prijs_per_eenheid);
    const extra = {};
    // De regeltotaal is leidend: wijkt aantal x prijs er meer dan 2% van af (korting, afronding, een verkeerd gelezen prijs), dan rekenen we met het totaal.
    if (aantalV && bedrag > 0 && (!ppv || Math.abs(ppv * aantalV - bedrag) / bedrag > 0.02)) {
      if (ppv && !(korting > 0)) extra.controle = "aantal x prijs wijkt af van het regelbedrag; prijs afgeleid uit het regelbedrag";
      ppv = bedrag / aantalV;
    }
    const inh = inhoud(r.verpakking_hoeveelheid, r.verpakking_eenheid);
    let aantal, eenh, prijs;
    if (inh && aantalV && ppv) { aantal = aantalV * inh.hoev; eenh = inh.eenheid; prijs = ppv / inh.hoev; }   // prijs per kg, l of stuk uit de inhoud van de verpakking
    else { aantal = aantalV; eenh = eenheid(r.eenheid); prijs = ppv; }
    if (tekst(r.opmerking, 200)) extra.opmerking = tekst(r.opmerking, 200);
    regels.push({
      omschrijving: omsch, sleutel: sleutel(omsch) || omsch.toLowerCase().slice(0, 60),
      categorie: ["food", "drank", "overig"].includes(r.categorie) ? r.categorie : categoriseer(omsch),
      aantal: aantal > 0 ? Math.round(aantal * 1000) / 1000 : null, eenheid: eenh,
      prijs_per_eenheid: prijs > 0 ? Math.round(prijs * 10000) / 10000 : null, bedrag: Number.isFinite(bedrag) && r.bedrag != null ? r2(bedrag) : null,
      artikelnummer: tekst(r.artikelnummer, 60), aantal_verpakkingen: aantalV ? Math.round(aantalV * 1000) / 1000 : null,
      verpakking_hoeveelheid: pos(r.verpakking_hoeveelheid), verpakking_eenheid: pos(r.verpakking_hoeveelheid) ? tekst(r.verpakking_eenheid, 12) : null,
      prijs_per_verpakking: ppv ? Math.round(ppv * 10000) / 10000 : null,
      korting_pct: korting > 0 && korting <= 100 ? r2(korting) : null, btw_pct: [0, 6, 9, 21].includes(Number(r.btw_pct)) && r.btw_pct != null ? Number(r.btw_pct) : null,
      extra: Object.keys(extra).length ? extra : null,
    });
  }
  const kop = {};
  for (const k of ["iban", "klantnummer", "referentie", "betaalconditie", "opmerkingen", "kortingen_of_toeslagen"]) { const v = tekst(j && j[k], 200); if (v) kop[k] = v; }
  return { datum, leverancier: tekst(j && j.leverancier, 120), factuurnummer: tekst(j && j.factuurnummer, 80),
    totaal: Number(j && j.totaal_excl_btw) > 0 ? r2(j.totaal_excl_btw) : regels.reduce((s, r) => s + (r.bedrag || 0), 0) || null,
    vervaldatum: isoDatum(j && j.vervaldatum), totaal_incl_btw: pos(j && j.totaal_incl_btw) ? r2(j.totaal_incl_btw) : null, btw_totaal: pos(j && j.btw_totaal) ? r2(j.btw_totaal) : null,
    extra: Object.keys(kop).length ? kop : null, regels };
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

const PROMPT = `Lees deze inkoopfactuur van een horecabedrijf zeer zorgvuldig en volledig. Lees ALLES wat er staat: de kop, elke regel met zijn volledige artikeltekst, en de totalen.
Kop: leverancier, factuurnummer, factuurdatum en vervaldatum (YYYY-MM-DD), totaal excl. btw, btw-bedrag, totaal incl. btw, IBAN, klantnummer bij de leverancier, referentie of ordernummer, betaalconditie, en eventuele opmerkingen, kortingen of toeslagen op factuurniveau.
Per regel (neem ook regels als transport, statiegeld, korting en toeslagen mee, als categorie overig):
- omschrijving: de volledige artikeltekst zoals op de factuur, inclusief verpakking en inhoud (bijvoorbeeld "Champignons 3 kg").
- artikelnummer als het er staat.
- aantal_verpakkingen: hoeveel verpakkingen, dozen, kratten, stuks of kilo's er zijn gefactureerd (de kolom aantal).
- verpakking_hoeveelheid en verpakking_eenheid (kg, g, l, cl, ml of stuk): de inhoud van ÉÉN verpakking zoals die uit de artikeltekst blijkt, bijvoorbeeld 3 en kg voor een pak van 3 kg, of 20 en l voor een fust van 20 liter. Verzin niets: staat de inhoud niet vermeld, laat deze velden dan weg.
- prijs_per_verpakking: de prijs excl. btw van één verpakking (de kolom prijs), voor eventuele korting.
- korting_pct als er korting op de regel staat, bedrag: het regeltotaal excl. btw na korting, btw_pct (0, 6, 9 of 21) als het erbij staat.
- categorie: food = eten en ingrediënten, drank = alle dranken, overig = schoonmaak, verpakking, energie, transport, statiegeld, diensten e.d.
- opmerking: alles opvallends bij de regel (aanbieding, kortingsactie, vervanging, geleverd in plaats van besteld).
Verzin niets: laat onbekende velden weg en neem alleen over wat er echt staat.`;
const REGEL = { type: "object", properties: { omschrijving: { type: "string" }, artikelnummer: { type: "string" }, categorie: { type: "string", enum: ["food", "drank", "overig"] }, aantal_verpakkingen: { type: "number" }, verpakking_hoeveelheid: { type: "number" }, verpakking_eenheid: { type: "string", enum: ["kg", "g", "l", "cl", "ml", "stuk"] }, prijs_per_verpakking: { type: "number" }, korting_pct: { type: "number" }, bedrag: { type: "number" }, btw_pct: { type: "number" }, opmerking: { type: "string" } }, required: ["omschrijving", "categorie"] };
const SCHEMA = { type: "object", properties: { leverancier: { type: "string" }, factuurnummer: { type: "string" }, factuurdatum: { type: "string" }, vervaldatum: { type: "string" }, totaal_excl_btw: { type: "number" }, btw_totaal: { type: "number" }, totaal_incl_btw: { type: "number" }, iban: { type: "string" }, klantnummer: { type: "string" }, referentie: { type: "string" }, betaalconditie: { type: "string" }, opmerkingen: { type: "string" }, kortingen_of_toeslagen: { type: "string" }, regels: { type: "array", items: REGEL } }, required: ["regels"] };

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
