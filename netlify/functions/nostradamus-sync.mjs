// Elk uur: haalt voor alle actieve Nostradamus-koppelingen rooster en gewerkte uren op.
import { ontsleutel } from "../lib/versleutel.mjs";
import { syncNostradamus } from "../lib/nostradamus.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...(o.headers || {}) } });
export default async () => {
  if (!URL_ || !SVC) { console.error("nostradamus-sync: Supabase niet ingesteld"); return; }
  const r = await rest("koppelingen?systeem=eq.nostradamus&status=neq.uit&locatie_id=not.is.null&select=id,klant_id,locatie_id");
  if (!r.ok) { console.error("nostradamus-sync: koppelingen ophalen mislukt", r.status); return; }
  for (const kop of await r.json()) {
    try {
      const g = await (await rest(`koppeling_geheimen?koppeling_id=eq.${kop.id}&select=gegevens`)).json();
      if (!g[0]) throw new Error("geen inloggegevens opgeslagen");
      console.log("nostradamus-sync", kop.id, JSON.stringify(await syncNostradamus(rest, kop, ontsleutel(g[0].gegevens))));
    } catch (e) { console.error("nostradamus-sync", kop.id, String(e.message || e)); }
  }
};
export const config = { schedule: "@hourly" };
