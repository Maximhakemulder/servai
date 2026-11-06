// SERVAI · maakt 's nachts per klant AI-adviezen (tabel ai_adviezen). Elke run doet een paar klanten die vandaag nog niet aan de beurt waren.
// Alleen actief met ANTHROPIC_API_KEY. Model: ADVIES_MODEL (standaard claude-sonnet-5-5: beter in overdenken; haiku is goedkoper).
import { samenvatFeiten, vraagAdvies } from "../lib/advies-ai.mjs";
import { registreer, ruimte } from "../lib/ai-kosten.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, KEY = process.env.ANTHROPIC_API_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, prefer: "return=minimal", ...(o.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const dag = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const PER_RUN = Number(process.env.ADVIES_PER_RUN) || 6, PARALLEL = 3;

async function maakVoor(k, l) {
  const L = `&locatie_id=eq.${l.id}`;
  const [omzet, loon, reserv, rooster, weer, evenementen, prijzen, gerechten, uren, groepen, artikelen] = await Promise.all([
    get(`omzet_per_dag?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-35)}&select=bedrijfsdag,omzet,bonnen,couverts&limit=2000`),
    get(`loonkosten_per_dag?klant_id=eq.${k.id}${L}&datum=gte.${dag(-35)}&select=datum,omzet,loonkosten,gewerkt_uren&limit=2000`),
    get(`reserveringen?klant_id=eq.${k.id}${L}&tijdstip=gte.${dag(0)}&tijdstip=lt.${dag(15)}&status=neq.geannuleerd&select=tijdstip,personen&limit=5000`),
    get(`rooster?klant_id=eq.${k.id}${L}&datum=gte.${dag(0)}&datum=lt.${dag(15)}&select=datum,uren&limit=5000`),
    get(`weer_dagen?klant_id=eq.${k.id}${L}&datum=gte.${dag(0)}&datum=lt.${dag(8)}&select=datum,code,temp_max,temp_min,regenkans,wind_max&order=datum&limit=100`),
    get(`evenementen?klant_id=eq.${k.id}&or=(locatie_id.eq.${l.id},locatie_id.is.null)&datum=gte.${dag(0)}&datum=lt.${dag(15)}&select=datum,tot,naam,drukte&limit=50`),
    get(`factuur_prijswijzigingen?klant_id=eq.${k.id}&select=omschrijving,leverancier,vorige_prijs,prijs,pct,eenheid&limit=200`),
    get(`gerecht_kostprijs?klant_id=eq.${k.id}&select=naam,groep,verkoopprijs,kostprijs&limit=500`),
    get(`omzet_per_uur?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-28)}&select=bedrijfsdag,uur,omzet&limit=20000`),
    get(`verkoop_per_groep_dag?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-56)}&select=bedrijfsdag,groep,aantal,omzet&limit=20000`),
    get(`verkoop_per_artikel_dag?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-56)}&select=bedrijfsdag,artikel,aantal,omzet&limit=50000`),
  ]);
  const feiten = samenvatFeiten({ klant: k, zaak: l.naam, omzet, loon, reserv, rooster, weer, evenementen, prijzen, gerechten, uren, groepen, artikelen });
  if (!feiten.heeft_data) return 0;                                   // te weinig kassadata voor zinnige adviezen
  const model = process.env.ADVIES_MODEL || "claude-sonnet-5-5";
  if (!(await ruimte(get, k.id))) return -1;      // cap van de klant (of standaardcap) bereikt: geen nieuwe adviezen tot de volgende maand
  const items = await vraagAdvies(feiten, { apiKey: KEY, model, onUsage: (u) => registreer(rest, { klant_id: k.id, locatie_id: l.id, soort: "advies", model }, u) });
  items.forEach((i) => { i.z = l.naam; });
  await rest("ai_adviezen?on_conflict=klant_id,locatie_id,datum", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ klant_id: k.id, locatie_id: l.id, datum: dag(0), items, model, gemaakt: new Date().toISOString() }) });
  return items.length;
}

export default async () => {
  if (!URL_ || !SVC || !KEY) return new Response("niet actief");
  const klanten = await get("klanten?status=eq.actief&select=id,loonnorm_pct&limit=1000"), kmap = new Map(klanten.map((k) => [k.id, k]));
  const locs = (await get("locaties?select=id,klant_id,naam&limit=3000")).filter((l) => kmap.has(l.klant_id));
  const klaar = new Set((await get(`ai_adviezen?datum=eq.${dag(0)}&select=locatie_id&limit=5000`)).map((r) => r.locatie_id));
  const wacht = locs.filter((l) => !klaar.has(l.id)).slice(0, PER_RUN);      // per zaak, niet per klant
  let n = 0, i = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (i < wacht.length) { const l = wacht[i++]; try { await maakVoor(kmap.get(l.klant_id), l); n++; } catch (e) { console.error("advies-ai", l.id, String(e.message || e)); } }
  }));
  return new Response(JSON.stringify({ zaken: n }));
};
// Elke 10 minuten een paar zaken die vandaag nog geen advies hebben (per zaak één keer per dag; dus ook een herkansing bij een fout).
export const config = { schedule: "*/10 * * * *" };
