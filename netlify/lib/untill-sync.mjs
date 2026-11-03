// Synchroniseert één unTill-koppeling: haalt nieuwe data op, vertaalt die en schrijft ze naar Supabase.
// Opnieuw ophalen van dezelfde periode is veilig (schrijf() werkt bestaande bonnen bij), daarom halen we
// bij elke run één dag extra op en gaan we nooit meer dan MAX_DAGEN per run terug of vooruit.
import { normaliseer, schrijf } from "./kassa.mjs";
import { maakClient, haalStamdata, haalPakket, naarLokaal } from "./untill.mjs";

const DAG = 24 * 3600 * 1000;
export const MAX_DAGEN = 31, START_DAGEN = 14;

/**
 * @param {(path: string, opt?: RequestInit) => Promise<Response>} rest  Supabase REST met service key
 * @param {{id: string, klant_id: string, locatie_id: string, sync_tot?: string|null}} kop
 * @param {{host: string, dbname: string, user: string, password: string, appToken: string, appNaam?: string}} geheim
 */
export async function syncKoppeling(rest, kop, geheim, { nu = new Date(), fetchImpl } = {}) {
  const ctx = { klant_id: kop.klant_id, locatie_id: kop.locatie_id };
  const status = async (velden) => { await rest(`koppelingen?id=eq.${kop.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(velden) }); };
  try {
    const client = maakClient({ ...geheim, fetchImpl });
    const sd = await haalStamdata(client);
    const einde = nu.getTime();
    const start = kop.sync_tot ? new Date(kop.sync_tot).getTime() - DAG : einde - START_DAGEN * DAG;
    const stop = Math.min(einde, start + MAX_DAGEN * DAG);
    const totaal = { bonnen: 0, regels: 0, uren: 0, fouten: 0 };
    for (let t = start; t < stop; t += DAG) {
      const tot = Math.min(t + DAG, stop);
      const pakket = await haalPakket(client, sd, naarLokaal(new Date(t)), naarLokaal(new Date(tot)));
      const d = normaliseer(pakket, ctx);
      const n = await schrijf(rest, ctx, d);
      totaal.bonnen += n.bonnen; totaal.regels += n.regels; totaal.uren += n.uren; totaal.fouten += d.fouten.length;
      if (d.fouten.length) console.warn(`untill ${kop.id}: ${d.fouten.length} fouten, eerste: ${d.fouten[0]}`);
    }
    await status({ status: "ok", laatste_succes: nu.toISOString(), laatste_fout: totaal.fouten ? `${totaal.fouten} regels overgeslagen, zie logboek` : null, sync_tot: new Date(stop).toISOString() });
    return { ok: true, ...totaal };
  } catch (e) {
    const m = String(e.message || e).slice(0, 300);
    await status({ status: "fout", laatste_fout: m });
    return { ok: false, fout: m };
  }
}
