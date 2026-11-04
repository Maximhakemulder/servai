// Hulp voor het inlezen van Excel/CSV: kolommen herkennen en rijen omzetten naar het SERVAI-standaardformaat.
// Wordt gebruikt in /beheer (browser) en in de tests (Node).

const sleutel = (t) => String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** "g", "gr", "kilo", "cl", "ltr", "st" enzovoort naar { basis: "kg"|"l"|"stuk", factor } (hoeveelheid in basiseenheid = hoeveelheid × factor). */
export function eenheidBasis(t) {
  const k = sleutel(t);
  if (!k) return null;
  const M = { g: ["kg", 0.001], gr: ["kg", 0.001], gram: ["kg", 0.001], kg: ["kg", 1], kilo: ["kg", 1], kilogram: ["kg", 1],
    ml: ["l", 0.001], cl: ["l", 0.01], dl: ["l", 0.1], l: ["l", 1], ltr: ["l", 1], liter: ["l", 1],
    stuk: ["stuk", 1], stuks: ["stuk", 1], st: ["stuk", 1], pcs: ["stuk", 1], x: ["stuk", 1] };
  const m = M[k];
  return m ? { basis: m[0], factor: m[1] } : null;
}

export const VELDEN = {
  uren: [
    { id: "datum", naam: "Datum", syn: ["datum", "date", "dag", "werkdag", "day"], verplicht: true },
    { id: "medewerker", naam: "Medewerker", syn: ["medewerker", "werknemer", "naam", "employee", "name", "personeel", "persoon"], verplicht: true },
    { id: "uren", naam: "Uren", syn: ["uren", "gewerkteuren", "gewerkt", "geplandeuren", "gepland", "hours", "aantaluren", "duur", "totaaluren"] },
    { id: "begin", naam: "Begintijd", syn: ["begin", "start", "begintijd", "starttijd", "van", "in"] },
    { id: "eind", naam: "Eindtijd", syn: ["eind", "einde", "eindtijd", "tot", "uit", "end"] },
    { id: "pauze", naam: "Pauze", syn: ["pauze", "break", "pauzetijd"] },
    { id: "uurloon", naam: "Uurloon", syn: ["uurloon", "tarief", "rate", "loonperuur", "uurtarief"] },
    { id: "kosten", naam: "Loonkosten", syn: ["loonkosten", "kosten", "totaalloon", "cost", "bruto", "loon"] },
  ],
  rooster: [
    { id: "datum", naam: "Datum", syn: ["datum", "date", "dag", "werkdag", "day"], verplicht: true },
    { id: "medewerker", naam: "Medewerker", syn: ["medewerker", "werknemer", "naam", "employee", "name", "personeel", "persoon"], verplicht: true },
    { id: "begin", naam: "Begintijd", syn: ["begin", "start", "begintijd", "starttijd", "van", "in"] },
    { id: "eind", naam: "Eindtijd", syn: ["eind", "einde", "eindtijd", "tot", "uit", "end"] },
    { id: "uren", naam: "Uren (als er geen tijden zijn)", syn: ["uren", "geplandeuren", "gepland", "hours", "aantaluren", "duur", "totaaluren"] },
    { id: "pauze", naam: "Pauze", syn: ["pauze", "break", "pauzetijd"] },
    { id: "functie", naam: "Functie / afdeling", syn: ["functie", "afdeling", "rol", "positie", "team", "dienst"] },
  ],
  menu: [
    { id: "naam", naam: "Gerecht / artikel", syn: ["gerecht", "gerechtnaam", "menuitem", "artikel", "artikelnaam", "product", "naam", "omschrijving", "item"], verplicht: true },
    { id: "groep", naam: "Groep", syn: ["groep", "categorie", "rubriek", "soort", "afdeling"] },
    { id: "verkoopprijs", naam: "Verkoopprijs", syn: ["verkoopprijs", "prijs", "bedrag", "verkoop"] },
    { id: "kostprijs", naam: "Kostprijs per portie (optioneel)", syn: ["kostprijs", "kostprijsperportie", "inkoopwaarde", "foodcost", "kosten"] },
  ],
  prijzen: [
    { id: "ingredient", naam: "Ingrediënt", syn: ["ingredient", "ingredientnaam", "grondstof", "product", "artikel", "naam", "omschrijving"], verplicht: true },
    { id: "prijs", naam: "Inkoopprijs (excl. btw)", syn: ["inkoopprijs", "prijs", "prijsperkg", "prijsperliter", "tarief", "bedrag"], verplicht: true },
    { id: "eenheid", naam: "Per (kg, l, stuk)", syn: ["eenheid", "per", "unit", "uom"] },
    { id: "leverancier", naam: "Leverancier", syn: ["leverancier", "supplier", "crediteur"] },
    { id: "datum", naam: "Datum", syn: ["datum", "factuurdatum", "date", "geldigvanaf"] },
  ],
  recept: [
    { id: "gerecht", naam: "Gerecht", syn: ["gerecht", "gerechtnaam", "menuitem", "menu", "artikel"], verplicht: true },
    { id: "ingredient", naam: "Ingrediënt", syn: ["ingredient", "ingredientnaam", "grondstof", "product"], verplicht: true },
    { id: "hoeveelheid", naam: "Hoeveelheid", syn: ["hoeveelheid", "aantal", "qty", "gewicht", "portie"] },
    { id: "eenheid", naam: "Eenheid (g, kg, ml, l, stuk)", syn: ["eenheid", "unit", "uom"] },
  ],
  inkoop: [
    { id: "datum", naam: "Datum", syn: ["datum", "factuurdatum", "leverdatum", "date", "boekdatum"], verplicht: true },
    { id: "leverancier", naam: "Leverancier", syn: ["leverancier", "supplier", "crediteur", "relatie", "bedrijf", "naam"], verplicht: true },
    { id: "bedrag", naam: "Bedrag (excl. btw)", syn: ["bedrag", "bedragexclbtw", "exclbtw", "netto", "totaal", "totaalexcl", "amount", "prijs", "waarde"], verplicht: true },
    { id: "omschrijving", naam: "Omschrijving", syn: ["omschrijving", "artikel", "product", "description", "item", "artikelnaam"] },
    { id: "categorie", naam: "Categorie", syn: ["categorie", "groep", "grootboek", "rubriek", "soort"] },
    { id: "aantal", naam: "Aantal", syn: ["aantal", "hoeveelheid", "qty", "stuks"] },
    { id: "factuur", naam: "Factuurnummer", syn: ["factuurnummer", "factuur", "nummer", "ref", "referentie"] },
  ],
};

/** Welke kolom (index) hoort bij welk veld? Geeft { veldId: index of -1 }. */
export function detecteer(kop, soort) {
  const k = kop.map(sleutel), gebruikt = new Set(), uit = {};
  const velden = VELDEN[soort];
  for (const pas of [(h, s) => h === s, (h, s) => s.length >= 4 && h.includes(s)]) {
    for (const v of velden) {
      if (uit[v.id] >= 0) continue;
      for (const s of v.syn) {
        const i = k.findIndex((h, j) => h && !gebruikt.has(j) && pas(h, s));
        if (i >= 0) { uit[v.id] = i; gebruikt.add(i); break; }
      }
    }
  }
  for (const v of velden) if (!(uit[v.id] >= 0)) uit[v.id] = -1;
  return uit;
}

const p2 = (n) => String(n).padStart(2, "0");
const echt = (j, m, d) => { const t = new Date(Date.UTC(j, m - 1, d)); return t.getUTCFullYear() === j && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/** 2026-11-01, 01-11-2026, 1/11/26, 01.11.2026 of een Excel-serienummer naar 2026-11-01. Anders null. */
export function parseDatum(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m && echt(+m[1], +m[2], +m[3])) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T ].*)?$/.exec(t);
  if (m) {
    let j = +m[3]; if (j < 100) j += 2000;
    if (echt(j, +m[2], +m[1])) return `${j}-${p2(m[2])}-${p2(m[1])}`;
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Math.round((Number(t) - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  }
  return null;
}

/** "1.234,56", "€ 12,50", "12.5", "-3" naar een getal. Anders null. */
export function parseGetal(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v).trim().replace(/[€\s ]/g, "");
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith("-")) { neg = true; t = t.slice(0, -1); }
  const c = t.lastIndexOf(","), d = t.lastIndexOf(".");
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (c >= 0) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

/** "8:30" of "8,5" of "8.5" naar uren (8.5). Anders null. */
export function parseUren(v) {
  if (v == null) return null;
  const t = String(v).trim();
  const m = /^(\d{1,3}):(\d{2})(?::\d{2})?$/.exec(t);
  if (m) return +m[1] + +m[2] / 60;
  return parseGetal(t);
}

const minuten = (v) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v == null ? "" : v).trim()); return m ? +m[1] * 60 + +m[2] : null; };
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Zet tabelrijen om naar standaardrijen.
 * @param {string[][]} rijen  alle rijen zonder de kopregel
 * @param {Record<string, number>} kol  uitkomst van detecteer (of aangepast door de gebruiker)
 * @param {"gewerkt"|"gepland"|"rooster"|"inkoop"} modus
 * @param {{uurloon?: number}} opt  uurloon als er geen loonkolom is
 */
export function bouwRijen(rijen, kol, modus, opt = {}) {
  const fouten = [], uit = [];
  let leeg = 0;
  const cel = (r, id) => (kol[id] >= 0 ? r[kol[id]] : undefined);
  const fout = (n, m) => { if (fouten.length < 20) fouten.push(`Rij ${n}: ${m}`); };
  rijen.forEach((r, i) => {
    const n = i + 2;
    if (!r || r.every((c) => String(c == null ? "" : c).trim() === "")) { leeg++; return; }
    if (modus === "menu") {
      const naam = String(cel(r, "naam") ?? "").trim();
      if (!naam) return fout(n, "naam ontbreekt");
      const pr = kol.verkoopprijs >= 0 ? parseGetal(cel(r, "verkoopprijs")) : null;
      const x = { naam, groep: String(cel(r, "groep") ?? "").trim() || null, verkoopprijs: pr === null ? null : r2(pr) };
      const kp = kol.kostprijs >= 0 ? parseGetal(cel(r, "kostprijs")) : null;
      if (kp !== null && kp >= 0) x.kostprijs = r2(kp);
      uit.push(x);
      return;
    }
    if (modus === "prijzen") {
      const ing = String(cel(r, "ingredient") ?? "").trim();
      const pr = parseGetal(cel(r, "prijs"));
      if (!ing) return fout(n, "ingrediënt ontbreekt");
      if (pr === null || pr < 0) return fout(n, `prijs niet herkend (“${cel(r, "prijs") ?? ""}”)`);
      const raw = kol.eenheid >= 0 ? String(cel(r, "eenheid") ?? "").trim() : "";
      const e = raw ? eenheidBasis(raw) : { basis: "kg", factor: 1 };
      if (!e) return fout(n, `eenheid niet herkend (“${raw}”), gebruik kg, g, l, ml of stuk`);
      const d = kol.datum >= 0 && String(cel(r, "datum") ?? "").trim() ? parseDatum(cel(r, "datum")) : null;
      if (kol.datum >= 0 && String(cel(r, "datum") ?? "").trim() && !d) return fout(n, "datum niet herkend");
      uit.push({ ingredient: ing, eenheid: e.basis, prijs: Math.round((pr / e.factor) * 10000) / 10000, leverancier: String(cel(r, "leverancier") ?? "").trim() || null, datum: d });
      return;
    }
    if (modus === "recept") {
      const ger = String(cel(r, "gerecht") ?? "").trim(), ing = String(cel(r, "ingredient") ?? "").trim();
      const hRaw = kol.hoeveelheid >= 0 ? String(cel(r, "hoeveelheid") ?? "").trim() : "";
      const h = hRaw ? parseGetal(hRaw) : null;
      if (!ger || !ing) return fout(n, "gerecht of ingrediënt ontbreekt");
      if (hRaw && (h === null || h <= 0)) return fout(n, `hoeveelheid niet herkend (“${hRaw}”)`);
      const raw = kol.eenheid >= 0 ? String(cel(r, "eenheid") ?? "").trim() : "";
      const e = raw ? eenheidBasis(raw) : { basis: "kg", factor: 1 };
      if (!e) return fout(n, `eenheid niet herkend (“${raw}”), gebruik g, kg, ml, l of stuk`);
      uit.push({ gerecht: ger, ingredient: ing, eenheid: e.basis, hoeveelheid: h === null ? null : Math.round(h * e.factor * 10000) / 10000 });
      return;
    }
    const datum = parseDatum(cel(r, "datum"));
    if (!datum) return fout(n, `datum niet herkend (“${cel(r, "datum") ?? ""}”)`);
    if (modus === "inkoop") {
      const lev = String(cel(r, "leverancier") ?? "").trim();
      const bedrag = parseGetal(cel(r, "bedrag"));
      if (!lev) return fout(n, "leverancier ontbreekt");
      if (bedrag === null) return fout(n, `bedrag niet herkend (“${cel(r, "bedrag") ?? ""}”)`);
      const ant = parseGetal(cel(r, "aantal"));
      uit.push({
        datum, leverancier: lev, bedrag: r2(bedrag),
        omschrijving: String(cel(r, "omschrijving") ?? "").trim() || null,
        categorie: String(cel(r, "categorie") ?? "").trim() || null,
        aantal: ant === null ? null : ant,
        factuur: String(cel(r, "factuur") ?? "").trim() || null,
      });
      return;
    }
    const med = String(cel(r, "medewerker") ?? "").trim();
    if (!med) return fout(n, "medewerker ontbreekt");
    let uren = kol.uren >= 0 ? parseUren(cel(r, "uren")) : null;
    if (uren === null && kol.begin >= 0 && kol.eind >= 0) {
      const a = minuten(cel(r, "begin")), b = minuten(cel(r, "eind"));
      if (a !== null && b !== null) {
        let d = b - a; if (d < 0) d += 1440;
        const p = kol.pauze >= 0 ? parseUren(cel(r, "pauze")) : null;
        const pm = p === null ? 0 : (/:/.test(String(cel(r, "pauze"))) || p < 5 ? p * 60 : p);
        uren = Math.max(0, d - pm) / 60;
      }
    }
    if (uren === null) return fout(n, "uren niet herkend");
    const rij = { datum, medewerker: med };
    if (modus === "rooster") {
      const a = kol.begin >= 0 ? minuten(cel(r, "begin")) : null, b2 = kol.eind >= 0 ? minuten(cel(r, "eind")) : null;
      const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
      rij.begin = a !== null && b2 !== null ? hm(a) : null;
      rij.eind = a !== null && b2 !== null ? hm(b2) : null;
      rij.uren = r2(uren);
      rij.functie = kol.functie >= 0 ? String(cel(r, "functie") ?? "").trim() || null : null;
    } else if (modus === "gepland") rij.gepland = r2(uren);
    else {
      rij.gewerkt = r2(uren);
      let k = kol.kosten >= 0 ? parseGetal(cel(r, "kosten")) : null;
      if (k === null) {
        const u = kol.uurloon >= 0 ? parseGetal(cel(r, "uurloon")) : (opt.uurloon > 0 ? opt.uurloon : null);
        if (u !== null) k = uren * u;
      }
      if (k !== null) rij.kosten = r2(k);
    }
    uit.push(rij);
  });
  // één medewerker kan meerdere diensten per dag hebben: tel die op
  let rijenUit = uit;
  if (modus === "menu" || modus === "prijzen" || modus === "recept") {
    const m = new Map();
    for (const x of uit) {
      const s = modus === "menu" ? x.naam.toLowerCase() : modus === "prijzen" ? x.ingredient.toLowerCase() + "|" + (x.datum || "") : x.gerecht.toLowerCase() + "|" + x.ingredient.toLowerCase();
      const b = m.get(s);
      if (!b) m.set(s, { ...x }); else if (modus === "recept") b.hoeveelheid = b.hoeveelheid === null && x.hoeveelheid === null ? null : Math.round(((b.hoeveelheid || 0) + (x.hoeveelheid || 0)) * 10000) / 10000; else m.set(s, { ...x });
    }
    rijenUit = [...m.values()];
  } else if (modus === "rooster") {
    // meerdere diensten per dag blijven los staan; alleen identieke regels tellen we één keer
    const m = new Map();
    for (const x of uit) m.set([x.datum, x.medewerker.toLowerCase(), x.begin, x.eind, x.uren].join("|"), x);
    rijenUit = [...m.values()];
  } else if (modus !== "inkoop") {
    const m = new Map();
    for (const x of uit) {
      const s = x.datum + "|" + x.medewerker.toLowerCase();
      const b = m.get(s);
      if (!b) m.set(s, { ...x });
      else for (const f of ["gepland", "gewerkt", "kosten"]) if (x[f] !== undefined) b[f] = r2((b[f] || 0) + x[f]);
    }
    rijenUit = [...m.values()];
  }
  return { rijen: rijenUit, fouten, leeg, gelezen: rijen.length - leeg };
}
