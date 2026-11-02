// Duwt kassadata (en uren) in het standaardformaat naar Supabase. Alleen voor SERVAI-beheerders.
// Bedoeld voor de eerste klant (handmatig of via een export) en om inleesmodules te testen.
// De geplande inleesmodules per kassasysteem gebruiken dezelfde functies uit netlify/lib/kassa.mjs.
import { normaliseer, schrijf } from "../lib/kassa.mjs";

const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...(opt.headers || {}) } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC) return json({ error: "Server niet ingesteld" }, 503);
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ur = t ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${t}` } }) : null;
  const u = ur && ur.ok ? await ur.json() : null;
  if (!u || !u.id) return json({ error: "Niet ingelogd" }, 401);
  const ad = await (await rest(`platform_beheerders?user_id=eq.${u.id}&select=user_id`)).json();
  if (!Array.isArray(ad) || !ad.length) return json({ error: "Geen toegang" }, 403);

  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  const lr = await rest(`locaties?id=eq.${encodeURIComponent(b.locatie_id || "")}&select=id,klant_id`);
  const loc = lr.ok ? (await lr.json())[0] : null;
  if (!loc) return json({ error: "Locatie niet gevonden" }, 404);
  const ctx = { klant_id: loc.klant_id, locatie_id: loc.id };

  const d = normaliseer(b, ctx);
  if (d.fouten.length && !b.deels) return json({ ok: false, geschreven: false, fouten: d.fouten.slice(0, 50), aantal_fouten: d.fouten.length }, 422);
  if (b.dry_run) return json({ ok: true, geschreven: false, bonnen: d.bonnen.length, regels: d.regels.length, uren: d.uren.length, temperaturen: (d.temperaturen || []).length, google_profiel: (d.google_profiel || []).length, evenementen: (d.evenementen || []).length, aantal_fouten: d.fouten.length, fouten: d.fouten.slice(0, 50) });
  try {
    const n = await schrijf(rest, ctx, d);
    await rest("logboek", { method: "POST", body: JSON.stringify({ klant_id: ctx.klant_id, user_id: u.id, actie: "ingest", details: { ...n, fouten: d.fouten.length } }) });
    return json({ ok: true, geschreven: true, ...n, aantal_fouten: d.fouten.length, fouten: d.fouten.slice(0, 50) });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
};
export const config = { path: "/api/ingest" };
