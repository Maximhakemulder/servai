// SERVAI · (achtergrondfunctie) zoekt marktprijzen voor producten van recente facturen en bewaart ze in markt_prijzen.
// Per product maximaal elke 14 dagen opnieuw; MARKT_PER_RUN (standaard 30) producten per run. Alleen actief met ANTHROPIC_API_KEY.
import { vraagMarkt } from "../lib/markt.mjs";
import { registreer, ruimte } from "../lib/ai-kosten.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, KEY = process.env.ANTHROPIC_API_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, prefer: "return=minimal", ...(o.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const MAX = Number(process.env.MARKT_PER_RUN) || 30, PARALLEL = 3, MODEL = process.env.MARKT_MODEL || "claude-haiku-5-5";

export default async () => {
  if (!URL_ || !SVC || !KEY) return new Response("niet actief");
  const sinds = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const regels = await get(`factuur_regels?datum=gte.${sinds}&categorie=in.(food,drank)&prijs_per_eenheid=gt.0&eenheid=not.is.null&order=datum.desc&select=klant_id,sleutel,omschrijving,eenheid,prijs_per_eenheid,leverancier&limit=5000`);
  const vers = new Set((await get(`markt_prijzen?gemeten=gte.${new Date(Date.now() - 14 * 864e5).toISOString()}&select=sleutel,eenheid&limit=20000`)).map((m) => m.sleutel + "|" + m.eenheid));
  const wacht = [], gezien = new Set();
  for (const r of regels) { const k = r.sleutel + "|" + r.eenheid; if (gezien.has(k) || vers.has(k)) continue; gezien.add(k); wacht.push(r); if (wacht.length >= MAX) break; }
  let ok = 0, geen = 0, i = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (i < wacht.length) {
      const p = wacht[i++];
      try {
        if (!(await ruimte(get, p.klant_id))) continue;                  // AI-cap van de klant die dit product inkocht
        const m = await vraagMarkt({ omschrijving: p.omschrijving, eenheid: p.eenheid, prijs: p.prijs_per_eenheid, leverancier: p.leverancier }, { apiKey: KEY, model: MODEL, onUsage: (u) => registreer(rest, { klant_id: p.klant_id, soort: "markt", model: MODEL }, u) });
        const rij = m ? { sleutel: p.sleutel, eenheid: p.eenheid, omschrijving: p.omschrijving, prijs: m.prijs, bron_naam: m.bron_naam, bron_url: m.bron_url, zekerheid: m.zekerheid, toelichting: m.toelichting, gemeten: new Date().toISOString() }
                     : { sleutel: p.sleutel, eenheid: p.eenheid, omschrijving: p.omschrijving, prijs: null, zekerheid: null, toelichting: "geen betrouwbare marktprijs gevonden", gemeten: new Date().toISOString() };
        const w = await rest("markt_prijzen?on_conflict=sleutel,eenheid", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rij) });
        if (!w.ok) throw new Error("opslaan mislukt: " + (await w.text()).slice(0, 120));
        m ? ok++ : geen++;
      } catch (e) { console.error("markt-benchmark", p.sleutel, String(e.message || e).slice(0, 160)); }
    }
  }));
  console.log("markt-benchmark", JSON.stringify({ producten: wacht.length, gevonden: ok, geen }));
  return new Response(JSON.stringify({ producten: wacht.length, gevonden: ok, geen }));
};
