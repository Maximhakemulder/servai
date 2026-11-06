// SERVAI · leest elke 5 minuten nieuwe facturen uit (regels, categorie, prijzen) en werkt ingrediëntprijzen bij (bron 'factuur').
// Alleen actief met ANTHROPIC_API_KEY. SERVAI past nooit prijzen in de kassa aan; dit vult alleen de inkoopprijzen.
import { registreer } from "../lib/ai-kosten.mjs";
import { leesFactuur, normaliseerFactuur, koppelIngredient } from "../lib/factuur-lezen.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, KEY = process.env.ANTHROPIC_API_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, prefer: "return=minimal", ...(o.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const BATCH = Number(process.env.FACTUUR_BATCH) || 12, PARALLEL = Number(process.env.FACTUUR_PARALLEL) || 4;
const MIME = (n) => (/\.pdf$/i.test(n) ? "application/pdf" : /\.png$/i.test(n) ? "image/png" : /\.jpe?g$/i.test(n) ? "image/jpeg" : null);

export default async () => {
  if (!URL_ || !SVC || !KEY) return new Response("niet actief");
  // Vastgelopen 'bezig' (functie afgebroken) na 10 minuten terug in de wachtrij, maximaal 3 pogingen.
  await rest(`facturen?status=eq.bezig&bezig_sinds=lt.${new Date(Date.now() - 600000).toISOString()}`, { method: "PATCH", body: JSON.stringify({ status: "ontvangen" }) });
  await rest("facturen?status=eq.ontvangen&pogingen=gte.3", { method: "PATCH", body: JSON.stringify({ status: "fout", fout: "Uitlezen mislukt na 3 pogingen" }) });
  const wacht = await get(`facturen?status=eq.ontvangen&bijlage_pad=not.is.null&klant_id=not.is.null&pogingen=lt.3&order=ontvangen.asc&limit=${BATCH}&select=id,klant_id,bijlage_pad,bestandsnaam,ontvangen,pogingen`);
  let klaar = 0;
  const verwerk = async (f0) => {
    // Claim: alleen wie de rij van 'ontvangen' naar 'bezig' zet mag hem verwerken (voorkomt dubbel werk bij overlappende runs).
    const c = await rest(`facturen?id=eq.${f0.id}&status=eq.ontvangen`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status: "bezig", bezig_sinds: new Date().toISOString(), pogingen: (f0.pogingen || 0) + 1 }) });
    if (!c.ok || !(await c.json()).length) return;
    const f = f0;
    try {
      const mime = MIME(f.bestandsnaam || f.bijlage_pad);
      if (!mime) { await rest(`facturen?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify({ status: "fout", fout: "Bestandstype niet ondersteund (PDF of afbeelding)" }) }); return; }
      const dl = await fetch(`${URL_}/storage/v1/object/facturen/${f.bijlage_pad}`, { headers: H });
      if (!dl.ok) throw new Error("bestand niet gevonden");
      const nf = normaliseerFactuur(await leesFactuur(await dl.arrayBuffer(), mime, { apiKey: KEY, model: process.env.FACTUUR_MODEL, onUsage: (u) => registreer(rest, { klant_id: f.klant_id, soort: "factuur", model: process.env.FACTUUR_MODEL || "claude-haiku-5-5" }, u) }), String(f.ontvangen).slice(0, 10));
      await rest(`factuur_regels?factuur_id=eq.${f.id}`, { method: "DELETE" });
      if (nf.regels.length) await rest("factuur_regels", { method: "POST", body: JSON.stringify(nf.regels.map((r) => ({ ...r, factuur_id: f.id, klant_id: f.klant_id, datum: nf.datum, leverancier: nf.leverancier }))) });
      const ing = await get(`ingredienten?klant_id=eq.${f.klant_id}&select=id,naam,eenheid&limit=2000`);
      const prijzen = new Map();
      for (const r of nf.regels) { const i = koppelIngredient(r, ing); if (i) prijzen.set(i.id, { klant_id: f.klant_id, ingredient_id: i.id, datum: nf.datum, prijs_per_eenheid: r.prijs_per_eenheid, leverancier: nf.leverancier, bron: "factuur" }); }
      if (prijzen.size) await rest("ingredient_prijzen?on_conflict=ingredient_id,datum", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([...prijzen.values()]) });
      await rest(`facturen?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify({ status: "verwerkt", verwerkt_op: new Date().toISOString(), fout: null, leverancier: nf.leverancier, factuurnummer: nf.factuurnummer, factuurdatum: nf.datum, bedrag: nf.totaal }) });
      klaar++;
    } catch (e) {
      // Tijdelijke fout (bijv. API-limiet): terug in de wachtrij; na 3 pogingen pas 'fout'.
      await rest(`facturen?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify({ status: "ontvangen", fout: String(e.message || e).slice(0, 200) }) });
    }
  };
  // PARALLEL facturen tegelijk, binnen de tijdslimiet van een geplande functie.
  const start = Date.now(); let i = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => { while (i < wacht.length && Date.now() - start < 15000) await verwerk(wacht[i++]); }));
  return new Response(JSON.stringify({ klaar }));
};
export const config = { schedule: "*/5 * * * *" };
