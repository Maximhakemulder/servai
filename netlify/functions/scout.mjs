// SERVAI · leads zoeken via Outscraper (Google Maps + e-mailadressen), alleen platformbeheerders.
// POST /api/scout  { actie:"start", soort, plaats, limiet } -> { id }   |   { actie:"status", id, soort } -> { klaar, nieuw, ... }
// Vereist in Netlify: OUTSCRAPER_API_KEY (+ SUPABASE_*). Nieuwe leads komen onder "Te keuren".
import { schoon } from "./leads-import.mjs";
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY, OKEY = process.env.OUTSCRAPER_API_KEY;
const OS = "https://api.app.outscraper.com";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...(opt.headers || {}) } });
const sch = (v) => (typeof v === "string" ? v.trim() : "");

// Zet Outscraper-resultaat om naar leads. Pakt het eerste geldige mailadres; zaken zonder mail vallen af.
export function uitOutscraper(data, soort) {
  const rijen = (Array.isArray(data) ? data : []).flat();
  const leads = []; let zonderMail = 0;
  for (const r of rijen) {
    if (!r || typeof r !== "object") continue;
    if (r.business_status && /CLOSED/i.test(r.business_status)) continue;
    const kand = [r.email_1, r.email_2, r.email_3, r.email, ...(Array.isArray(r.emails) ? r.emails.map((e) => (typeof e === "string" ? e : e && e.value)) : [])].map(sch).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (!kand.length) { zonderMail++; continue; }
    leads.push({ email: kand[0], bedrijf: r.name, plaats: r.city || r.town, soort: soort || r.type, website: r.site || r.website, telefoon: r.phone, naam: null, openingszin: null });
  }
  return { leads, zonderMail, gevonden: rijen.length };
}

export default async (req) => { try { return await verwerk(req); } catch (e) { return json({ error: String(e.message || e) }, 500); } };

async function verwerk(req) {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC) return json({ error: "Server niet ingesteld" }, 503);
  if (!OKEY) return json({ error: "Voeg OUTSCRAPER_API_KEY toe in Netlify en deploy opnieuw." }, 503);
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ur = tk ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${tk}` } }) : null;
  const u = ur && ur.ok ? await ur.json() : null;
  if (!u || !u.id) return json({ error: "Niet ingelogd" }, 401);
  const ad = await (await rest(`platform_beheerders?user_id=eq.${u.id}&select=user_id`)).json();
  if (!Array.isArray(ad) || !ad.length) return json({ error: "Geen toegang" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }

  if (b.actie === "start") {
    const soort = sch(b.soort).slice(0, 60), plaats = sch(b.plaats).slice(0, 80), limiet = Math.min(100, Math.max(1, Math.round(+b.limiet) || 20));
    if (!soort || !plaats) return json({ error: "Vul soort zaak en plaats in" }, 400);
    const p = new URLSearchParams({ query: `${soort}, ${plaats}, Nederland`, limit: String(limiet), language: "nl", region: "NL", dropDuplicates: "true", enrichment: "contacts_n_leads", async: "true" });
    const r = await fetch(`${OS}/maps/search-v3?${p}`, { headers: { "X-API-KEY": OKEY } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) return json({ error: "Outscraper: " + (d.errorMessage || d.error || r.status) }, 502);
    return json({ ok: true, id: String(d.id) });
  }

  if (b.actie === "status") {
    const id = sch(b.id);
    if (!/^[\w-]{8,80}$/.test(id)) return json({ error: "Ongeldig id" }, 400);
    const r = await fetch(`${OS}/requests/${id}`, { headers: { "X-API-KEY": OKEY } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "Outscraper: " + (d.errorMessage || d.error || r.status) }, 502);
    const st = String(d.status || "");
    if (/pending|running|queued/i.test(st)) return json({ ok: true, klaar: false });
    if (!/success/i.test(st)) return json({ error: "Outscraper meldt: " + (st || "onbekende status") }, 502);
    const { leads, zonderMail, gevonden } = uitOutscraper(d.data, sch(b.soort).slice(0, 60));
    const { uit, ongeldig } = schoon(leads);
    uit.forEach((x) => { x.bron = "outscraper"; });
    let nieuw = 0;
    for (let i = 0; i < uit.length; i += 200) {
      const w = await rest("mail_contacten?on_conflict=email", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(uit.slice(i, i + 200)) });
      if (!w.ok) return json({ error: "Opslaan mislukt: " + (await w.text()).slice(0, 200) }, 502);
      nieuw += (await w.json()).length;
    }
    return json({ ok: true, klaar: true, gevonden, nieuw, bestond_al: uit.length - nieuw, zonder_mail: zonderMail, ongeldig });
  }
  return json({ error: "Onbekende actie" }, 400);
}
export const config = { path: "/api/scout" };
