// SERVAI · B2B-mail vanuit /beheer (alleen platformbeheerders): handmatig versturen en testmails.
// Body: { actie: "nu", contact_ids: [..max 25] } (stuurt de eerste of opvolgmail meteen) of { actie: "test", naar, soort: "eerste"|"opvolg" }
// Vereist in Netlify: SUPABASE_*, RESEND_API_KEY, MAIL_VAN (bijv. "SERVAI <maxim@mail.servai.nl>"); optioneel MAIL_ANTWOORD, SERVAI_URL.
import { bouw, verstuur, BASIS } from "../lib/mail.mjs";
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=representation", ...(opt.headers || {}) } });
const get = async (p) => { const r = await rest(p); return r.ok ? r.json() : []; };
const mailOk = (e) => typeof e === "string" && /^\S+@\S+\.\S+$/.test(e) && e.length < 200;
const UUID = /^[0-9a-f-]{36}$/i;

export default async (req) => { try { return await verwerk(req); } catch (e) { return json({ error: String(e.message || e) }, 500); } };

async function verwerk(req) {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC) return json({ error: "Server niet ingesteld" }, 503);
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ur = t ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${t}` } }) : null;
  const u = ur && ur.ok ? await ur.json() : null;
  if (!u || !u.id) return json({ error: "Niet ingelogd" }, 401);
  const ad = await get(`platform_beheerders?user_id=eq.${u.id}&select=user_id`);
  if (!ad.length) return json({ error: "Geen toegang" }, 403);
  const KEY = process.env.RESEND_API_KEY, VAN = process.env.MAIL_VAN;
  if (!KEY || !VAN) return json({ error: "Mail is nog niet ingesteld: voeg RESEND_API_KEY en MAIL_VAN toe in Netlify." }, 503);
  let b; try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  const inst = (await get("mail_instellingen?id=eq.1&select=*"))[0];
  if (!inst) return json({ error: "Instellingen ontbreken (SQL niet gedraaid?)" }, 503);
  const ids = [inst.eerste_sjabloon_id, inst.opvolg_sjabloon_id].filter(Boolean);
  const sj = ids.length ? await get(`mail_sjablonen?id=in.(${ids.join(",")})&select=*`) : [];
  const sjablonen = { eerste: sj.find((x) => x.id === inst.eerste_sjabloon_id), opvolg: sj.find((x) => x.id === inst.opvolg_sjabloon_id) };
  const replyTo = process.env.MAIL_ANTWOORD || undefined;

  if (b.actie === "test") {
    const soort = b.soort === "opvolg" ? "opvolg" : "eerste";
    if (!mailOk(b.naar)) return json({ error: "Vul een geldig e-mailadres in" }, 400);
    if (!sjablonen[soort]) return json({ error: "Sla eerst de mailtekst op" }, 400);
    const base = BASIS(), m = bouw(sjablonen[soort], { naam: "Jan Jansen", bedrijf: "Restaurant Voorbeeld", plaats: "Utrecht", openingszin: "Een gezellig restaurant aan de gracht waar gasten graag blijven hangen." }, `${base}/api/afmelden?t=test`, `${base}/api/k?t=test`, `${base}/api/terugbellen?t=test`);
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: VAN, to: [b.naar], subject: "[TEST] " + m.onderwerp, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}) }) });
    if (!r.ok) return json({ error: "Testmail mislukt: " + (await r.text()).slice(0, 200) }, 502);
    return json({ ok: true });
  }
  if (b.actie !== "nu") return json({ error: "Onbekende actie" }, 400);
  const cids = [...new Set(Array.isArray(b.contact_ids) ? b.contact_ids.filter((x) => UUID.test(String(x))) : [])].slice(0, 25);
  if (!cids.length) return json({ error: "Kies minstens één lead" }, 400);
  const contacten = await get(`mail_contacten?id=in.(${cids.join(",")})&select=*`);
  const geldig = contacten.filter((c) => !c.afgemeld && c.status !== "afgemeld");
  const items = geldig.map((c) => ({ contact: c, type: ["gemaild", "opgevolgd"].includes(c.status) ? "opvolg" : "eerste" }));
  if (!items.length) return json({ error: "Alle gekozen leads zijn afgemeld", overgeslagen: contacten.length }, 422);
  const r = await verstuur(rest, { items, sjablonen, inst, from: VAN, replyTo, key: KEY });
  if (r.fout) return json({ error: "Versturen mislukt: " + r.fout }, 502);
  await rest("logboek", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ klant_id: null, user_id: u.id, actie: "b2b_mail", details: { verstuurd: r.verstuurd } }) });
  return json({ ok: true, verstuurd: r.verstuurd, overgeslagen: ids.length - items.length });
}
export const config = { path: "/api/mail" };
