// Hulp voor het inlezen van Excel/CSV: kolommen herkennen en rijen omzetten naar het SERVAI-standaardformaat.
// Wordt gebruikt in /beheer (browser) en in de tests (Node).

const sleutel = (t) => String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

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
 * @param {"gewerkt"|"gepland"|"inkoop"} modus
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
    if (modus === "gepland") rij.gepland = r2(uren);
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
  if (modus !== "inkoop") {
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
