// SERVAI · maakt 's nachts per klant AI-adviezen (tabel ai_adviezen). Elke run doet een paar klanten die vandaag nog niet aan de beurt waren.
// Alleen actief met ANTHROPIC_API_KEY. Model: ADVIES_MODEL (standaard claude-sonnet-5-5: beter in overdenken; haiku is goedkoper).
import { vraagAdvies } from "../lib/advies-ai.mjs";
import { haalFeiten, dag } from "../lib/feiten.mjs";
import { registreer, ruimte } from "../lib/ai-kosten.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, KEY = process.env.ANTHROPIC_API_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, prefer: "return=minimal", ...(o.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const PER_RUN = Number(process.env.ADVIES_PER_RUN) || 6, PARALLEL = 3;

async function maakVoor(k, l) {
  const feiten = await haalFeiten(get, k, l);
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
