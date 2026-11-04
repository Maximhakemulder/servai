// SERVAI · leest elke 15 minuten de inbox van de verzendmailbox (IMAP): reacties van leads, bounces en "stop"-antwoorden.
// Alleen actief bij versturen via SMTP (MAIL_USER/MAIL_PASSWORD). Leest alleen, verwijdert of verplaatst niets.
import { modus, imapConf } from "../lib/transport.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal", ...(opt.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const STOP = /\b(afmelden|uitschrijven|geen interesse|niet meer mailen|verwijder mij|stop)\b/i;

/** Bepaalt per binnengekomen bericht wat het betekent. Puur, zodat het te testen is. */
export function beoordeel({ van, tekst, inReplyTo }, contacten, bekendeIds) {
  const e = String(van || "").toLowerCase();
  if (/mailer-daemon|postmaster/.test(e)) {
    const lc = String(tekst || "").toLowerCase();
    const hit = contacten.find((c) => lc.includes(c.email));
    return hit ? { soort: "bounce", contact: hit } : null;
  }
  const c = contacten.find((x) => x.email === e) || (inReplyTo && bekendeIds.get(String(inReplyTo).trim()));
  if (!c) return null;
  return { soort: STOP.test(String(tekst || "").slice(0, 200)) ? "stop" : "reactie", contact: c };
}

export default async () => {
  if (!URL_ || !SVC || modus() !== "smtp") return new Response("niet actief");
  const inst = (await get("mail_instellingen?id=eq.1&select=aan"))[0];
  if (!inst) return new Response("geen instellingen");
  const contacten = (await get("mail_contacten?status=in.(gemaild,opgevolgd,afspraak,wachtrij,te_keuren)&select=id,email,status,gereageerd&limit=5000")).map((c) => ({ ...c, email: String(c.email).toLowerCase() }));
  const bekendeIds = new Map();
  for (const v of await get("mail_verzonden?resend_id=not.is.null&order=aangemaakt.desc&limit=1000&select=resend_id,contact_id")) { const c = contacten.find((x) => x.id === v.contact_id); if (c) bekendeIds.set(v.resend_id, c); }
  const { ImapFlow } = await import("imapflow");
  const k = imapConf();
  const client = new ImapFlow({ host: k.host, port: k.port, secure: true, auth: { user: k.user, pass: k.pass }, logger: false, socketTimeout: 20000 });
  let reacties = 0, bounces = 0, stops = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = (await client.search({ since: new Date(Date.now() - 3 * 864e5) }, { uid: true })) || [];
      for await (const m of client.fetch(uids.slice(-150), { envelope: true, source: { maxLength: 60000 } }, { uid: true })) {
        const src = m.source ? m.source.toString("utf8") : "";
        const body = src.split(/\r?\n\r?\n/).slice(1).join("\n\n").replace(/=\r?\n/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const r = beoordeel({ van: m.envelope && m.envelope.from && m.envelope.from[0] && m.envelope.from[0].address, tekst: body, inReplyTo: m.envelope && m.envelope.inReplyTo }, contacten, bekendeIds);
        if (!r) continue;
        const c = r.contact, nu = new Date().toISOString();
        if (r.soort === "bounce") {
          if (!["fout", "afgemeld"].includes(c.status)) { await rest(`mail_contacten?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "fout", fout: "Mail kwam niet aan (bounce)" }) }); await rest(`mail_verzonden?contact_id=eq.${c.id}&bounce_op=is.null`, { method: "PATCH", body: JSON.stringify({ bounce_op: nu }) }); bounces++; c.status = "fout"; }
        } else if (r.soort === "stop") {
          if (c.status !== "afgemeld") { await rest(`mail_contacten?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "afgemeld", afgemeld: true }) }); stops++; c.status = "afgemeld"; }
        } else if (!c.gereageerd) { await rest(`mail_contacten?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ gereageerd: true }) }); c.gereageerd = true; reacties++; }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { try { client.close(); } catch {} return new Response("inbox niet bereikbaar: " + (e.authenticationFailed ? "inloggen mislukt" : e.code || e.message)); }
  return new Response(JSON.stringify({ reacties, bounces, stops }));
};
export const config = { schedule: "*/15 * * * *" };
