// Voor SERVAI-beheerders en voor de eigen medewerkers van een klant (eigenaar, bedrijfsleider, boekhouder): leest uren, rooster of inkoop in uit een bestand dat in /beheer is herkend.
// Body: { locatie_id, soort: "rooster" | "gewerkt" | "gepland" | "inkoop", rijen: [...] } (rijen in het standaardformaat).
import { normaliseer, schrijf } from "../lib/kassa.mjs";
import { normaliseerInkoop, schrijfInkoop } from "../lib/inkoop.mjs";

const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", ...(opt.headers || {}) } });

export default async (req) => {
  try { return await verwerk(req); } catch (e) { return json({ error: "Onverwachte fout: " + String(e.message || e) }, 500); }
};
async function verwerk(req) {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC) return json({ error: "Server niet ingesteld" }, 503);
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ur = t ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${t}` } }) : null;
  const u = ur && ur.ok ? await ur.json() : null;
  if (!u || !u.id) return json({ error: "Niet ingelogd" }, 401);
  const ad = await (await rest(`platform_beheerders?user_id=eq.${u.id}&select=user_id`)).json();
  const beheerder = Array.isArray(ad) && ad.length > 0;
  let prof = null;
  if (!beheerder) {
    const pr = await (await rest(`profielen?id=eq.${u.id}&select=klant_id,rol,locatie_id,actief`)).json();
    prof = Array.isArray(pr) ? pr[0] : null;
    if (!prof || !prof.actief || !["eigenaar", "bedrijfsleider", "boekhouder"].includes(prof.rol)) return json({ error: "Geen toegang" }, 403);
  }

  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  if (!["rooster", "gewerkt", "gepland", "inkoop"].includes(b.soort)) return json({ error: "soort moet rooster, gewerkt, gepland of inkoop zijn" }, 400);
  if (!Array.isArray(b.rijen) || !b.rijen.length) return json({ error: "Geen rijen ontvangen" }, 400);
  if (typeof b.locatie_id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.locatie_id)) return json({ error: "locatie_id ontbreekt" }, 400);
  const lr = await rest(`locaties?id=eq.${b.locatie_id}&select=id,klant_id`);
  const loc = lr.ok ? (await lr.json())[0] : null;
  if (!loc) return json({ error: "Locatie niet gevonden" }, 404);
  if (prof && (loc.klant_id !== prof.klant_id || (prof.locatie_id && prof.locatie_id !== loc.id))) return json({ error: "Geen toegang tot deze locatie" }, 403);
  if (prof && prof.rol === "boekhouder" && b.soort !== "inkoop") return json({ error: "Geen toegang" }, 403);
  const ctx = { klant_id: loc.klant_id, locatie_id: loc.id };

  let ingelezen;
  if (b.soort === "rooster") {
    // Een nieuw rooster vervangt het oude voor de datums in het bestand; nieuwe datums worden toegevoegd.
    const dienst = [];
    for (const [i, r] of b.rijen.entries()) {
      const datum = String(r.datum || ""), med = String(r.medewerker || "").trim().slice(0, 120), uren = Number(r.uren);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !med || !Number.isFinite(uren) || uren < 0 || uren > 24) return json({ error: `Rij ${i + 1}: datum, medewerker of uren klopt niet` }, 422);
      const tijd = (t) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : null);
      dienst.push({ klant_id: ctx.klant_id, locatie_id: ctx.locatie_id, datum, medewerker: med, begin_tijd: tijd(r.begin), eind_tijd: tijd(r.eind), uren: Math.round(uren * 100) / 100, functie: r.functie ? String(r.functie).trim().slice(0, 60) || null : null, bron: "upload" });
    }
    if (dienst.length > 20000) return json({ error: "Te veel regels in één bestand" }, 413);
    const dagen = dienst.map((d) => d.datum).sort(), van = dagen[0], tot = dagen[dagen.length - 1];
    if ((Date.parse(tot) - Date.parse(van)) / 864e5 > 400) return json({ error: "Het rooster beslaat meer dan 400 dagen" }, 422);
    const bereik = `locatie_id=eq.${loc.id}&datum=gte.${van}&datum=lte.${tot}`;
    let x = await rest(`rooster?${bereik}`, { method: "DELETE" });
    if (!x.ok) return json({ error: "Oude rooster verwijderen mislukt" }, 500);
    for (let i = 0; i < dienst.length; i += 1000) {
      x = await rest("rooster", { method: "POST", body: JSON.stringify(dienst.slice(i, i + 1000)) });
      if (!x.ok) return json({ error: "Rooster opslaan mislukt" }, 500);
    }
    // geplande uren per medewerker per dag: eerst leegmaken voor deze periode, daarna vullen
    x = await rest(`uren?${bereik}`, { method: "PATCH", body: JSON.stringify({ gepland_uren: 0 }) });
    if (!x.ok) return json({ error: "Geplande uren bijwerken mislukt" }, 500);
    const m = new Map();
    for (const d of dienst) {
      const k = d.datum + "|" + d.medewerker.toLowerCase(), e = m.get(k);
      if (e) e.gepland_uren = Math.round((e.gepland_uren + d.uren) * 100) / 100;
      else m.set(k, { klant_id: d.klant_id, locatie_id: d.locatie_id, datum: d.datum, medewerker: d.medewerker, gepland_uren: d.uren });
    }
    const d = await schrijf(rest, ctx, { bonnen: [], regels: [], uren: [...m.values()] });
    ingelezen = dienst.length;
    void d;
  } else if (b.soort === "inkoop") {
    const n = normaliseerInkoop(b.rijen, ctx);
    if (n.fouten.length) return json({ error: n.fouten.slice(0, 5).join("; "), fouten: n.fouten }, 422);
    ingelezen = await schrijfInkoop(rest, n.rijen);
  } else {
    // Gepland en gewerkt worden los ingelezen: we sturen alleen de kolommen mee die bij deze upload horen,
    // zodat een rooster-upload geen gewerkte uren overschrijft (en andersom).
    const n = normaliseer({ uren: b.rijen.map((r) => ({ datum: r.datum, medewerker: r.medewerker, gepland: r.gepland, gewerkt: r.gewerkt, kosten: r.kosten })) }, ctx);
    if (n.fouten.length) return json({ error: n.fouten.slice(0, 5).join("; "), fouten: n.fouten }, 422);
    const m = new Map();
    for (const x of n.uren) {
      const o = { klant_id: x.klant_id, locatie_id: x.locatie_id, datum: x.datum, medewerker: x.medewerker };
      if (b.soort === "gepland") o.gepland_uren = x.gepland_uren;
      else { o.gewerkt_uren = x.gewerkt_uren; o.kosten = x.kosten; }
      const s = o.datum + "|" + o.medewerker.toLowerCase();
      const e = m.get(s);
      if (!e) m.set(s, o); else for (const f of ["gepland_uren", "gewerkt_uren", "kosten"]) if (o[f] !== undefined) e[f] = Math.round(((e[f] || 0) + o[f]) * 100) / 100;
    }
    const d = await schrijf(rest, ctx, { bonnen: [], regels: [], uren: [...m.values()] });
    ingelezen = d.uren;
  }
  await rest("logboek", { method: "POST", body: JSON.stringify({ klant_id: loc.klant_id, user_id: u.id, actie: "upload_" + b.soort, details: { locatie_id: loc.id, rijen: ingelezen } }) });
  return json({ ok: true, ingelezen });
}
export const config = { path: "/api/upload" };
