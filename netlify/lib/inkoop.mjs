// SERVAI · inkoopregels controleren en wegschrijven (uit een Excel/CSV-upload of later uit facturen).
import { createHash } from "node:crypto";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const tekst = (v, max) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
export const MAX_INKOOP = 5000;

/** Controleert regels { datum, leverancier, bedrag, omschrijving?, categorie?, aantal?, factuur? }. */
export function normaliseerInkoop(rijen, ctx) {
  const uit = { rijen: [], fouten: [] };
  const fout = (m) => { if (uit.fouten.length < 50) uit.fouten.push(m); };
  if (!Array.isArray(rijen)) { fout("Geen rijen ontvangen"); return uit; }
  if (rijen.length > MAX_INKOOP) { fout(`Te veel regels (${rijen.length}, maximaal ${MAX_INKOOP})`); return uit; }
  const teller = new Map();
  rijen.forEach((r, i) => {
    const n = `regel ${i + 1}`;
    const datum = r && r.datum, lev = tekst(r && r.leverancier, 120), bedrag = Number(r && r.bedrag);
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return fout(`${n}: datum ontbreekt`);
    if (!lev) return fout(`${n}: leverancier ontbreekt`);
    if (!Number.isFinite(bedrag)) return fout(`${n}: bedrag moet een getal zijn`);
    const aantal = r.aantal === null || r.aantal === undefined || r.aantal === "" ? null : Number(r.aantal);
    if (aantal !== null && !Number.isFinite(aantal)) return fout(`${n}: aantal moet een getal zijn`);
    const omsch = tekst(r.omschrijving, 200), cat = tekst(r.categorie, 80), fac = tekst(r.factuur, 80);
    // dezelfde regel opnieuw uploaden vervangt hem (geen dubbele inkoop), twee identieke regels in één bestand blijven allebei staan
    const basis = createHash("sha1").update([datum, lev, omsch || "", r2(bedrag), fac || "", aantal ?? ""].join("|")).digest("hex").slice(0, 24);
    const k = (teller.get(basis) || 0) + 1; teller.set(basis, k);
    uit.rijen.push({ klant_id: ctx.klant_id, locatie_id: ctx.locatie_id, datum, leverancier: lev, omschrijving: omsch, categorie: cat, aantal, bedrag: r2(bedrag), factuur_ref: fac, bron_ref: `${basis}#${k}` });
  });
  return uit;
}

export async function schrijfInkoop(rest, rijen) {
  for (let i = 0; i < rijen.length; i += 500) {
    const r = await rest("inkoop?on_conflict=locatie_id,bron_ref", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rijen.slice(i, i + 500)) });
    if (!r.ok) throw new Error("Wegschrijven naar inkoop mislukt: " + (await r.text()).slice(0, 200));
  }
  return rijen.length;
}
