// Alleen voor SERVAI-beheerders: legt een unTill-koppeling vast voor een locatie.
// Test eerst de verbinding, slaat dan de inloggegevens versleuteld op en draait direct een eerste synchronisatie.
// Body: { locatie_id, host, dbname, user, password, appToken, appNaam? }
import { versleutel } from "../lib/versleutel.mjs";
import { syncKoppeling } from "../lib/untill-sync.mjs";
import { maakClient } from "../lib/untill.mjs";

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
  for (const k of ["locatie_id", "host", "dbname", "user", "password", "appToken"]) if (!b[k] || typeof b[k] !== "string") return json({ error: `${k} ontbreekt` }, 400);
  const lr = await rest(`locaties?id=eq.${encodeURIComponent(b.locatie_id)}&select=id,klant_id`);
  const loc = lr.ok ? (await lr.json())[0] : null;
  if (!loc) return json({ error: "Locatie niet gevonden" }, 404);

  const geheim = { host: b.host.trim(), dbname: b.dbname.trim(), user: b.user, password: b.password, appToken: b.appToken.trim(), ...(b.appNaam ? { appNaam: String(b.appNaam).trim() } : {}) };
  try { await maakClient(geheim).get("sales-area-info"); }
  catch (e) { return json({ error: "Verbinding met unTill mislukt: " + String(e.message || e) }, 422); }

  const ex = await (await rest(`koppelingen?locatie_id=eq.${loc.id}&systeem=eq.untill&select=id,sync_tot`)).json();
  let kop = ex[0];
  if (!kop) {
    const c = await rest("koppelingen", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ klant_id: loc.klant_id, locatie_id: loc.id, soort: "kassa", systeem: "untill", status: "niet_getest" }) });
    if (!c.ok) return json({ error: "Koppeling aanmaken mislukt" }, 500);
    kop = (await c.json())[0];
  }
  const s = await rest("koppeling_geheimen?on_conflict=koppeling_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ koppeling_id: kop.id, gegevens: versleutel(geheim), bijgewerkt: new Date().toISOString() }) });
  if (!s.ok) return json({ error: "Inloggegevens opslaan mislukt" }, 500);

  const res = await syncKoppeling(rest, { id: kop.id, klant_id: loc.klant_id, locatie_id: loc.id, sync_tot: kop.sync_tot }, geheim);
  await rest("logboek", { method: "POST", body: JSON.stringify({ klant_id: loc.klant_id, user_id: u.id, actie: "koppel_untill", details: { koppeling_id: kop.id, ...res } }) });
  return json({ koppeling_id: kop.id, ...res }, res.ok ? 200 : 502);
};
export const config = { path: "/api/koppel-untill" };
