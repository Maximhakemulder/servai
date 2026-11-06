// Elke nacht en elke 3 uur: verwachting (7 dagen) plus de afgelopen 3 dagen als 'gemeten' vastleggen per locatie.
import { haalWeer } from "../lib/weer.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
const coords = async (l) => {
  if (l.lat != null && l.lon != null) return { lat: +l.lat, lon: +l.lon };
  if (!l.plaats) return null;
  const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=nl&countryCode=NL&name=" + encodeURIComponent(l.plaats));
  const x = r.ok && (await r.json()).results?.[0]; return x ? { lat: x.latitude, lon: x.longitude } : null;
};
export default async () => {
  if (!URL_ || !SVC) return new Response("niet actief");
  const r = await rest("locaties?select=id,klant_id,plaats,lat,lon&or=(plaats.not.is.null,lat.not.is.null)");
  if (!r.ok) return new Response("locaties mislukt", { status: 500 });
  const vandaag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  let n = 0;
  for (const l of await r.json()) {
    try {
      const c = await coords(l); if (!c) continue;
      const rijen = (await haalWeer({ ...c, verleden: 3, dagen: 7 })).map((d) => ({ ...d, klant_id: l.klant_id, locatie_id: l.id, gemeten: d.datum < vandaag, bijgewerkt: new Date().toISOString() }));
      const p = await rest("weer_dagen?on_conflict=locatie_id,datum", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rijen) });
      if (!p.ok) throw new Error("opslaan " + p.status);
      n += rijen.length;
    } catch (e) { console.error("weer-sync", l.id, String(e.message || e)); }
  }
  return new Response(JSON.stringify({ rijen: n }));
};
export const config = { schedule: "0 */3 * * *" };
