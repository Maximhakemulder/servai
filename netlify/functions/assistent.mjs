// SERVAI · "Vraag SERVAI": de ondernemer stelt een vraag over zijn zaak, AI antwoordt op basis van de eigen cijfers.
// POST { vraag, locatie_id | "all", historie: [{r:"u"|"a", t}], klant_id? (alleen beheerders) }. Alleen actief met ANTHROPIC_API_KEY.
// Model: ASSISTENT_MODEL (standaard Haiku: snel en goedkoop). Telt mee in het AI-maximum van de klant.
import { haalFeiten } from "../lib/feiten.mjs";
import { registreer, ruimte } from "../lib/ai-kosten.mjs";
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY, KEY = process.env.ANTHROPIC_API_KEY;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal", ...(o.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const MAX_ZAKEN = 5;

export const SYSTEEM = `Je bent SERVAI, de assistent van een horecaondernemer. Je beantwoordt vragen over zijn zaak op basis van de aangeleverde cijfers (JSON).
Regels:
- Kort, zakelijk Nederlands, zonder uitroeptekens. Eerst het antwoord, dan hooguit twee zinnen onderbouwing met concrete cijfers.
- Gebruik uitsluitend de aangeleverde cijfers. Staat het antwoord er niet in of is er te weinig data, zeg dat eerlijk en noem welke koppeling of data ontbreekt. Verzin nooit cijfers.
- Vergelijk dagen met dezelfde weekdag, niet met gisteren. Reken zelf na wat in euro's per maand relevant is.
- SERVAI adviseert alleen: je past nooit prijzen, roosters of bestellingen aan en zegt ook nooit dat je dat doet. De ondernemer beslist.
- Geen gastgegevens noemen. Alleen vragen over deze zaak(en), omzet, personeel, gasten, reserveringen, inkoop en menu. Andere vragen beleefd afwijzen in een zin.
- Facturen (facturen_hele_organisatie) zijn per organisatie, niet per zaak. Status: ontvangen = binnen, bezig = wordt nu uitgelezen, verwerkt = uitgelezen, gepauzeerd = AI-maximum bereikt, fout = uitlezen mislukt.
- Bij meerdere zaken: noem de zaaknaam bij elk cijfer.`;

export async function beantwoord({ vraag, historie, feiten, model, apiKey, onUsage }) {
  const msgs = [];
  for (const h of (Array.isArray(historie) ? historie : []).slice(-6)) {
    const t = String((h && h.t) || "").slice(0, 1500); if (!t) continue;
    const r = h.r === "a" ? "assistant" : "user";
    if (msgs.length && msgs[msgs.length - 1].role === r) continue;
    msgs.push({ role: r, content: t });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: "Cijfers (JSON, vandaag is " + new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }) + "):\n" + JSON.stringify(feiten) + "\n\nVraag: " + vraag });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 700, system: SYSTEEM, messages: msgs }),
  });
  if (!r.ok) throw new Error(`assistent mislukt (${r.status})`);
  const out = await r.json();
  if (onUsage) await onUsage(out.usage);
  return ((out.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n")).trim();
}

export default async (req) => {
  try { return await verwerk(req); } catch (e) { console.error("assistent", String(e.message || e)); return json({ error: "Er ging iets mis. Probeer het zo opnieuw." }, 500); }
};
async function verwerk(req) {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC || !KEY) return json({ error: "De assistent is nog niet ingesteld." }, 503);
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ur = t ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${t}` } }) : null;
  const u = ur && ur.ok ? await ur.json() : null;
  if (!u || !u.id) return json({ error: "Niet ingelogd" }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  const vraag = String(b.vraag || "").trim().slice(0, 500);
  if (vraag.length < 2) return json({ error: "Stel een vraag." }, 400);

  const ad = await get(`platform_beheerders?user_id=eq.${u.id}&select=user_id`);
  let klant_id, vastLoc = null;
  if (Array.isArray(ad) && ad.length) klant_id = /^[0-9a-f-]{36}$/i.test(b.klant_id || "") ? b.klant_id : null;
  else {
    const pr = await get(`profielen?id=eq.${u.id}&select=klant_id,locatie_id,actief`), p = pr[0];
    if (!p || !p.actief) return json({ error: "Geen toegang" }, 403);
    klant_id = p.klant_id; vastLoc = p.locatie_id;
  }
  if (!klant_id) return json({ error: "Geen klant gekozen" }, 400);
  const k = (await get(`klanten?id=eq.${klant_id}&select=id,loonnorm_pct`))[0];
  if (!k) return json({ error: "Klant niet gevonden" }, 404);
  if (!(await ruimte(get, klant_id))) return json({ error: "Je AI-maximum voor deze maand is bereikt. Verhoog het onder Adviezen (AI-gebruik) of wacht tot de volgende maand.", cap: true }, 429);

  let locs = await get(`locaties?klant_id=eq.${klant_id}&select=id,naam&order=naam&limit=50`);
  if (vastLoc) locs = locs.filter((l) => l.id === vastLoc);
  else if (/^[0-9a-f-]{36}$/i.test(b.locatie_id || "")) locs = locs.filter((l) => l.id === b.locatie_id);
  locs = locs.slice(0, MAX_ZAKEN);
  if (!locs.length) return json({ error: "Geen zaak gevonden" }, 404);
  const feiten = await Promise.all(locs.map((l) => haalFeiten(get, k, l)));
  // Facturen gelden voor de hele organisatie: laatste 40 (status, bedrag, leverancier) + de regels van de recentste, zodat de assistent ze kan noemen.
  const fac = await get(`facturen?klant_id=eq.${klant_id}&select=id,ontvangen,leverancier,van,onderwerp,bedrag,status,fout&order=ontvangen.desc&limit=40`);
  const fr = fac.length ? await get(`factuur_regels?klant_id=eq.${klant_id}&factuur_id=in.(${fac.slice(0, 10).map((f) => f.id).join(",")})&select=factuur_id,omschrijving,categorie,aantal,eenheid,prijs_per_eenheid,bedrag&limit=300`) : [];
  const inkoop = { facturen_hele_organisatie: fac.map((f) => ({ ontvangen: String(f.ontvangen).slice(0, 10), leverancier: f.leverancier || f.van, onderwerp: f.onderwerp, bedrag_excl_btw: f.bedrag, status: f.status, ...(f.fout ? { fout: f.fout } : {}), regels: fr.filter((r) => r.factuur_id === f.id).map((r) => ({ artikel: r.omschrijving, categorie: r.categorie, aantal: r.aantal, eenheid: r.eenheid, prijs: r.prijs_per_eenheid, bedrag: r.bedrag })) })) };
  const alle = feiten.length === 1 ? { ...feiten[0], ...inkoop } : { zaken: feiten, ...inkoop };
  const model = process.env.ASSISTENT_MODEL || "claude-haiku-5-5";
  const antwoord = await beantwoord({ vraag, historie: b.historie, feiten: alle, model, apiKey: KEY,
    onUsage: (us) => registreer(rest, { klant_id, locatie_id: locs.length === 1 ? locs[0].id : null, soort: "assistent", model }, us) });
  return json({ antwoord: antwoord || "Daar kan ik nu geen antwoord op geven." });
}
