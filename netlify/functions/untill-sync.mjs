// Elk uur: haalt voor alle actieve unTill-koppelingen de nieuwe omzet en uren op.
import { ontsleutel } from "../lib/versleutel.mjs";
import { syncKoppeling } from "../lib/untill-sync.mjs";

const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...(opt.headers || {}) } });

export default async () => {
  if (!URL_ || !SVC) { console.error("untill-sync: Supabase niet ingesteld"); return; }
  const r = await rest("koppelingen?systeem=eq.untill&status=neq.uit&locatie_id=not.is.null&select=id,klant_id,locatie_id,sync_tot");
  if (!r.ok) { console.error("untill-sync: koppelingen ophalen mislukt", r.status); return; }
  for (const kop of await r.json()) {
    try {
      const g = await (await rest(`koppeling_geheimen?koppeling_id=eq.${kop.id}&select=gegevens`)).json();
      if (!g[0]) throw new Error("geen inloggegevens opgeslagen");
      const res = await syncKoppeling(rest, kop, ontsleutel(g[0].gegevens));
      console.log("untill-sync", kop.id, JSON.stringify(res));
    } catch (e) { console.error("untill-sync", kop.id, String(e.message || e)); }
  }
};
export const config = { schedule: "@hourly" };
