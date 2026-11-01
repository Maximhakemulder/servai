// SERVAI · standaard kassaformaat.
// Elke inleesmodule (Untill, Zenchef, een CSV-upload, ...) levert data in dit formaat aan.
// Deze module controleert het, rekent btw om naar omzet (netto) en schrijft het naar Supabase.
// Zie docs/dataformaat.md voor de beschrijving van de velden.

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
const isNum = (v) => v !== null && Number.isFinite(v);
const tekst = (v, max = 200) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

export const MAX_BONNEN = 5000;

/**
 * Controleert en vertaalt een pakket naar rijen voor de database.
 * @param {{bonnen?: any[], uren?: any[]}} pakket
 * @param {{klant_id: string, locatie_id: string}} ctx
 * @returns {{bonnen: object[], regels: object[], uren: object[], fouten: string[]}}
 */
export function normaliseer(pakket, ctx) {
  const uit = { bonnen: [], regels: [], uren: [], fouten: [] };
  const fout = (m) => { if (uit.fouten.length < 200) uit.fouten.push(m); };
  const bonnen = Array.isArray(pakket && pakket.bonnen) ? pakket.bonnen : [];
  const uren = Array.isArray(pakket && pakket.uren) ? pakket.uren : [];
  if (bonnen.length > MAX_BONNEN) { fout(`Te veel bonnen in één pakket (${bonnen.length}, maximaal ${MAX_BONNEN}).`); return uit; }
  const gezien = new Set();

  bonnen.forEach((b, i) => {
    const ref = tekst(b && b.ref, 80);
    const naam = `bon ${ref || "#" + (i + 1)}`;
    if (!ref) return fout(`${naam}: ref ontbreekt`);
    if (gezien.has(ref)) return fout(`${naam}: komt dubbel voor in dit pakket`);
    gezien.add(ref);
    const t = new Date(b.tijd);
    if (!b.tijd || isNaN(t)) return fout(`${naam}: tijd ontbreekt of is ongeldig (gebruik bijvoorbeeld 2026-11-01T21:14:00+01:00)`);
    const storno = !!b.storno;
    const sign = storno ? -1 : 1;
    const regelsIn = Array.isArray(b.regels) ? b.regels : [];
    const regels = [];
    let regelFout = false;

    regelsIn.forEach((rg, j) => {
      const rn = `${naam}, regel ${j + 1}`;
      const artikel = tekst(rg && rg.artikel, 160);
      const aantal = rg.aantal === undefined ? 1 : num(rg.aantal);
      let bruto = num(rg.bedrag);          // bedrag incl. btw voor de hele regel
      let netto = num(rg.netto);           // optioneel: omzet excl. btw
      const pct = num(rg.btw_pct);
      if (!artikel) { regelFout = true; return fout(`${rn}: artikel ontbreekt`); }
      if (!isNum(aantal)) { regelFout = true; return fout(`${rn}: aantal is geen getal`); }
      if (!isNum(bruto) && !isNum(netto)) { regelFout = true; return fout(`${rn}: bedrag ontbreekt`); }
      if (!isNum(netto)) {
        if (!isNum(pct)) { regelFout = true; return fout(`${rn}: geef btw_pct of netto mee, anders kan de omzet niet worden uitgerekend`); }
        netto = bruto / (1 + pct / 100);
      }
      if (!isNum(bruto)) bruto = netto * (1 + (isNum(pct) ? pct : 0) / 100);
      // een storno met positieve bedragen draaien we om, bedragen die al negatief zijn laten we staan
      const s = storno && bruto > 0 ? -1 : 1;
      regels.push({
        klant_id: ctx.klant_id, locatie_id: ctx.locatie_id, tijdstip: t.toISOString(),
        artikel, groep: tekst(rg.groep, 80), aantal: r2(aantal * s), bedrag: r2(netto * s),
        medewerker: tekst(b.medewerker, 80), bron_ref: `${ref}:${j + 1}`, bon_ref: ref,
        btw_pct: isNum(pct) ? pct : null, korting: r2(Math.abs(num(rg.korting) || 0)),
        _bruto: r2(bruto * s),
      });
    });
    if (regelFout) return;

    let totaal = num(b.totaal), netto = num(b.netto), btw = num(b.btw);
    if (regels.length) {
      const sNetto = regels.reduce((a, x) => a + x.bedrag, 0), sBruto = regels.reduce((a, x) => a + x._bruto, 0);
      netto = r2(sNetto);
      if (!isNum(totaal)) totaal = r2(sBruto); else totaal = r2(totaal * (storno && totaal > 0 ? -1 : 1));
      btw = r2(totaal - netto);
    } else {
      if (!isNum(totaal)) return fout(`${naam}: totaal ontbreekt`);
      const s = storno && totaal > 0 ? -1 : 1;
      totaal = r2(totaal * s);
      if (isNum(netto)) netto = r2(netto * (storno && netto > 0 ? -1 : 1));
      else if (isNum(btw)) { btw = r2(btw * (storno && btw > 0 ? -1 : 1)); netto = r2(totaal - btw); }
      else return fout(`${naam}: geef netto of btw mee (of de regels met btw_pct), anders kan de omzet niet worden uitgerekend`);
      btw = isNum(btw) ? btw : r2(totaal - netto);
    }
    let couverts = b.couverts === undefined || b.couverts === null ? null : Math.round(num(b.couverts));
    if (couverts !== null && (!Number.isFinite(couverts) || couverts < 0 || couverts > 500)) couverts = null;

    uit.bonnen.push({
      klant_id: ctx.klant_id, locatie_id: ctx.locatie_id, bon_ref: ref, tijdstip: t.toISOString(),
      ...(b.bedrijfsdag && /^\d{4}-\d{2}-\d{2}$/.test(b.bedrijfsdag) ? { bedrijfsdag: b.bedrijfsdag } : {}),
      couverts, tafel: tekst(b.tafel, 40), medewerker: tekst(b.medewerker, 80), betaalwijze: tekst(b.betaalwijze, 40),
      totaal, netto, btw, fooi: isNum(num(b.fooi)) ? r2(num(b.fooi)) : null,
      korting: r2(Math.abs(num(b.korting) || 0)), is_storno: storno,
    });
    regels.forEach((x) => { delete x._bruto; uit.regels.push(x); });
  });

  uren.forEach((u, i) => {
    const naam = `uren #${i + 1}`;
    const datum = u && u.datum;
    const med = tekst(u && u.medewerker, 80);
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return fout(`${naam}: datum ontbreekt (gebruik 2026-11-01)`);
    if (!med) return fout(`${naam}: medewerker ontbreekt`);
    const g = num(u.gepland), w = num(u.gewerkt), k = num(u.kosten);
    if ([g, w, k].some((x) => x !== null && !Number.isFinite(x))) return fout(`${naam}: gepland, gewerkt en kosten moeten getallen zijn`);
    uit.uren.push({
      klant_id: ctx.klant_id, locatie_id: ctx.locatie_id, datum, medewerker: med,
      gepland_uren: g || 0, gewerkt_uren: w || 0, kosten: r2(k || 0), bron_ref: tekst(u.ref, 80),
    });
  });
  return uit;
}

const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

/**
 * Schrijft genormaliseerde rijen weg. Opnieuw inlezen van dezelfde bon werkt de bon bij
 * (de regels van die bon worden eerst vervangen), dus dubbel inlezen is veilig.
 * @param {(path: string, opt?: RequestInit) => Promise<Response>} rest  fetch naar Supabase REST met de service key
 */
export async function schrijf(rest, ctx, d) {
  const up = async (tabel, rijen, conflict) => {
    for (const c of chunks(rijen, 500)) {
      const r = await rest(`${tabel}?on_conflict=${conflict}`, { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(c) });
      if (!r.ok) throw new Error(`Wegschrijven naar ${tabel} mislukt: ${(await r.text()).slice(0, 200)}`);
    }
  };
  if (d.bonnen.length) {
    for (const c of chunks(d.bonnen.map((b) => b.bon_ref), 200)) {
      const lijst = c.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(",");
      const r = await rest(`verkoop?locatie_id=eq.${ctx.locatie_id}&bon_ref=in.(${encodeURIComponent(lijst)})`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      if (!r.ok) throw new Error("Oude regels vervangen mislukt: " + (await r.text()).slice(0, 200));
    }
    await up("bonnen", d.bonnen, "locatie_id,bon_ref");
    await up("verkoop", d.regels, "locatie_id,bron_ref");
  }
  if (d.uren.length) await up("uren", d.uren, "locatie_id,datum,medewerker");
  return { bonnen: d.bonnen.length, regels: d.regels.length, uren: d.uren.length };
}
