// Alleen voor SERVAI-beheerders: legt een Nostradamus-koppeling (rooster en gewerkte uren, alleen lezen) vast voor een locatie.
// Body: { locatie_id, klant (het deel voor .nostradamus.nu), api_key, office_id? }. Test eerst de verbinding en draait direct een eerste synchronisatie.
import { versleutel } from "../lib/versleutel.mjs";
import { maakClient, syncNostradamus, KLANT_RE } from "../lib/nostradamus.mjs";
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...(o.headers || {}) } });
export default async (req) => { try { return await verwerk(req); } catch (e) { return json({ error: "Onverwachte fout: " + String(e.message || e) }, 500); } };
async function verwerk(req) {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC) return json({ error: "Server niet ingesteld" }, 503);
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ur = t ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${t}` } }) : null;
  const u = ur && ur.ok ? await ur.json() : null;
  if (!u || !u.id) return json({ error: "Niet ingelogd" }, 401);
  const ad = await (await rest(`platform_beheerders?user_id=eq.${u.id}&select=user_id`)).json();
  if (!Array.isArray(ad) || !ad.length) return json({ error: "Geen toegang" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  const klant = String(b.klant || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.nostradamus\.nu.*$/, "");
  if (!KLANT_RE.test(klant)) return json({ error: "Klantnaam ongeldig: vul alleen het deel voor .nostradamus.nu in" }, 400);
  if (!b.api_key || typeof b.api_key !== "string" || !/^[0-9a-f-]{36}$/i.test(b.locatie_id || "")) return json({ error: "locatie_id en api_key zijn verplicht" }, 400);
  const lr = await rest(`locaties?id=eq.${b.locatie_id}&select=id,klant_id`);
  const loc = lr.ok ? (await lr.json())[0] : null;
  if (!loc) return json({ error: "Locatie niet gevonden" }, 404);

  const geheim = { klant, api_key: b.api_key.trim(), office_id: b.office_id ? String(b.office_id).trim() : null };
  let kantoren;
  try { kantoren = await maakClient(geheim).get("offices"); } catch (e) { return json({ error: "Verbinding met Nostradamus mislukt: " + String(e.message || e) }, 422); }
  if (!geheim.office_id) {
    if (kantoren.length === 1) geheim.office_id = String(kantoren[0].office_id);
    else return json({ error: "Kies een kantoor", kantoren: kantoren.map((k) => ({ office_id: k.office_id, office_name: k.office_name })) }, 409);
  }
  const ex = await (await rest(`koppelingen?locatie_id=eq.${loc.id}&systeem=eq.nostradamus&select=id`)).json();
  let kop = ex[0];
  if (!kop) {
    const c = await rest("koppelingen", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ klant_id: loc.klant_id, locatie_id: loc.id, soort: "rooster", systeem: "nostradamus", status: "niet_getest" }) });
    if (!c.ok) return json({ error: "Koppeling aanmaken mislukt" }, 500);
    kop = (await c.json())[0];
  }
  const s = await rest("koppeling_geheimen?on_conflict=koppeling_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ koppeling_id: kop.id, gegevens: versleutel(geheim), bijgewerkt: new Date().toISOString() }) });
  if (!s.ok) return json({ error: "Inloggegevens opslaan mislukt" }, 500);
  const res = await syncNostradamus(rest, { id: kop.id, klant_id: loc.klant_id, locatie_id: loc.id }, geheim);
  await rest("logboek", { method: "POST", body: JSON.stringify({ klant_id: loc.klant_id, user_id: u.id, actie: "koppel_nostradamus", details: { koppeling_id: kop.id, office_id: geheim.office_id, ...res } }) });
  return json({ koppeling_id: kop.id, ...res }, res.ok ? 200 : 502);
}
export const config = { path: "/api/koppel-nostradamus" };
