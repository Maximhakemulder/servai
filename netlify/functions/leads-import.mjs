// Publiek met geheime sleutel: je scraper stuurt hier zijn leads naartoe. Nieuwe leads komen in /beheer onder "Te keuren".
// POST /api/leads  Authorization: Bearer <LEADS_API_KEY>
// Body: { leads: [{ email, bedrijf, naam, plaats, soort, website, telefoon, openingszin }] }   (max. 1000 per keer)
// Bestaande mailadressen en afgemelde leads worden overgeslagen.
import { timingSafeEqual } from "node:crypto";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, KEY = process.env.LEADS_API_KEY;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const t = (v, m) => (typeof v === "string" ? v.trim().slice(0, m) : "") || null;

export function schoon(lijst) {
  const gezien = new Set(), uit = [];
  let ongeldig = 0;
  for (const x of lijst) {
    const email = t(x && x.email, 200);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { ongeldig++; continue; }
    const k = email.toLowerCase();
    if (gezien.has(k)) continue;
    gezien.add(k);
    uit.push({ email: k, bedrijf: t(x.bedrijf, 160), naam: t(x.naam, 120), plaats: t(x.plaats, 80), soort: t(x.soort, 60), website: t(x.website, 200), telefoon: t(x.telefoon, 40), openingszin: t(x.openingszin, 400), bron: "scraper", status: "te_keuren" });
  }
  return { uit, ongeldig };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !SVC || !KEY) return json({ error: "niet ingesteld" }, 503);
  const gegeven = Buffer.from((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")), echt = Buffer.from(KEY);
  if (gegeven.length !== echt.length || !timingSafeEqual(gegeven, echt)) return json({ error: "Geen toegang" }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  const lijst = Array.isArray(b) ? b : Array.isArray(b && b.leads) ? b.leads : null;
  if (!lijst || !lijst.length) return json({ error: "Stuur { leads: [...] }" }, 400);
  if (lijst.length > 1000) return json({ error: "Maximaal 1000 leads per keer" }, 413);
  const { uit, ongeldig } = schoon(lijst);
  let nieuw = 0;
  for (let i = 0; i < uit.length; i += 200) {
    const r = await fetch(`${URL_}/rest/v1/mail_contacten?on_conflict=email`, { method: "POST", headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(uit.slice(i, i + 200)) });
    if (!r.ok) return json({ error: "Opslaan mislukt: " + (await r.text()).slice(0, 200) }, 502);
    nieuw += (await r.json()).length;
  }
  return json({ ok: true, nieuw, bestond_al: uit.length - nieuw, ongeldig });
};
export const config = { path: "/api/leads" };
