// SERVAI · leest elke 5 minuten de factuurmailbox (IMAP) en bewaart bijlagen per klant. Leest alleen, verwijdert niets uit de mailbox.
// Koppelen aan klant: eerst via het adres facturen+<code>@… (klanten.factuur_code), anders via een bekende afzender (factuur_afzenders).
// Mailbox: FACTUUR_MAIL_USER / FACTUUR_MAIL_PASSWORD (anders MAIL_USER / MAIL_PASSWORD). PDF's ouder dan 12 maanden worden gewist; gegevens blijven.
import { imapConf } from "../lib/transport.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const rest = (p, o = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...o, headers: { ...H, prefer: "return=minimal", ...(o.headers || {}) } });
const get = async (p) => { const r = await rest(p, { headers: { prefer: "return=representation" } }); return r.ok ? r.json() : []; };
const BEWAAR_DAGEN = 365, MAX = Number(process.env.FACTUUR_MAX_PER_RUN) || 150;

/** Bepaalt bij welke klant een mail hoort. Puur, zodat het te testen is. */
export function kiesKlant({ aan, van }, klanten, afzenders) {
  const adressen = (aan || []).map((a) => String(a).toLowerCase());
  for (const a of adressen) { const m = a.match(/\+([a-z0-9]+)@/); const k = m && klanten.find((x) => x.factuur_code === m[1]); if (k) return k.id; }
  const v = String(van || "").toLowerCase();
  const a = afzenders.find((x) => x.email === v);
  return a ? a.klant_id : null;
}
const veilig = (n) => String(n || "factuur.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 100);

export default async () => {
  if (!URL_ || !SVC) return new Response("niet actief");
  const k = imapConf();
  const user = process.env.FACTUUR_MAIL_USER || k.user, pass = process.env.FACTUUR_MAIL_PASSWORD || k.pass;
  if (!user || !pass) return new Response("geen mailbox ingesteld");
  // Opruimen: bestanden ouder dan 12 maanden
  const oud = await get(`facturen?bijlage_pad=not.is.null&ontvangen=lt.${new Date(Date.now() - BEWAAR_DAGEN * 864e5).toISOString()}&select=id,bijlage_pad&limit=200`);
  for (const f of oud) {
    const r = await fetch(`${URL_}/storage/v1/object/facturen/${f.bijlage_pad}`, { method: "DELETE", headers: H });
    if (r.ok || r.status === 404) await rest(`facturen?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify({ bijlage_pad: null }) });
  }
  const klanten = await get("klanten?select=id,factuur_code"), afzenders = await get("factuur_afzenders?select=klant_id,email");
  const { ImapFlow } = await import("imapflow"), { simpleParser } = await import("mailparser");
  const client = new ImapFlow({ host: k.host, port: k.port, secure: true, auth: { user, pass }, logger: false, socketTimeout: 30000 });
  let nieuw = 0, fouten = 0, gezien = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Alleen nieuwe mails sinds de vorige keer (UID-bladwijzer), maximaal MAX per run; de rest volgt de volgende run.
      const st = (await get("factuur_mailstatus?id=eq.1&select=uidvalidity,laatste_uid"))[0] || { uidvalidity: null, laatste_uid: 0 };
      const uv = Number(client.mailbox.uidValidity);
      let vanaf = st.uidvalidity && Number(st.uidvalidity) === uv ? Number(st.laatste_uid) : 0;
      let uids = (await client.search(vanaf ? { uid: `${vanaf + 1}:*` } : { since: new Date(Date.now() - 14 * 864e5) }, { uid: true })) || [];
      uids = uids.filter((u) => u > vanaf).sort((a, b) => a - b).slice(0, MAX);
      let hoogste = vanaf; const start = Date.now();
      for await (const m of client.fetch(uids, { source: { maxLength: 15e6 } }, { uid: true })) {
        if (Date.now() - start > 22000) break;   // blijf onder de tijdslimiet; de rest volgt
        if (fouten) break;               // niet verder: de bladwijzer blijft vóór de mislukte mail, zodat die de volgende run opnieuw wordt geprobeerd
        gezien++;
        const p = await simpleParser(m.source);
        const mid = String(p.messageId || "").slice(0, 200) || `uid-${m.uid}`;
        if ((await get(`facturen?message_id=eq.${encodeURIComponent(mid)}&select=id&limit=1`)).length) { hoogste = Math.max(hoogste, m.uid); continue; }
        const van = (p.from && p.from.value[0] && p.from.value[0].address || "").toLowerCase();
        const aan = [].concat(p.to || [], p.cc || []).flatMap((x) => x.value.map((v) => v.address));
        const klant = kiesKlant({ aan, van }, klanten, afzenders);
        const bijl = (p.attachments || []).filter((a) => /pdf|xml|image/i.test(a.contentType) && a.size < 10e6);
        for (const [i, a] of (bijl.length ? bijl : [null]).entries()) {
          let pad = null;
          if (a && klant) {
            pad = `${klant}/${Date.now()}-${i}-${veilig(a.filename)}`;
            const r = await fetch(`${URL_}/storage/v1/object/facturen/${pad}`, { method: "POST", headers: { ...H, "content-type": a.contentType || "application/octet-stream" }, body: a.content });
            if (!r.ok) pad = null;
          }
          const ins = await rest("facturen", { method: "POST", body: JSON.stringify({ klant_id: klant, ontvangen: (p.date || new Date()).toISOString(), van, onderwerp: String(p.subject || "").slice(0, 200), bestandsnaam: a ? veilig(a.filename) : null, bijlage_pad: pad, grootte: a ? a.size : null, message_id: bijl.length > 1 ? `${mid}#${i}` : mid, status: klant ? "ontvangen" : "niet_gekoppeld" }) });
          if (!ins.ok) { fouten++; console.error("facturen-inbox opslaan mislukt", ins.status, (await ins.text()).slice(0, 300)); continue; }
          console.log("factuur ontvangen", JSON.stringify({ van, klant: klant || null, bijlage: !!pad, onderwerp: String(p.subject || "").slice(0, 60) }));
          nieuw++;
        }
        if (!fouten) hoogste = Math.max(hoogste, m.uid);
      }
      await rest("factuur_mailstatus?id=eq.1", { method: "PATCH", body: JSON.stringify({ uidvalidity: uv, laatste_uid: hoogste, bijgewerkt: new Date().toISOString() }) });
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { try { await client.logout(); } catch {} return new Response("fout: " + (e.code || e.message || "verbinding"), { status: 500 }); }
  console.log("facturen-inbox", JSON.stringify({ gezien, nieuw, fouten }));
  return new Response(JSON.stringify({ gezien, nieuw, fouten }));
};
export const config = { schedule: "*/5 * * * *" };
