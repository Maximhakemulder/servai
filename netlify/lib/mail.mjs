// B2B-mail: sjablonen vullen, mail opbouwen, kiezen wie er nu aan de beurt is en versturen via SMTP (eigen mailbox) of Resend.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eerste = (n) => String(n || "").trim().split(/\s+/)[0] || "";
export const AFZENDER = "MH Holding B.V. (SERVAI) · KvK 86540440";

/** Vervangt {{voornaam}}, {{naam}}, {{bedrijf}}, {{plaats}}, {{openingszin}}, {{demolink}} en {{terugbellink}}. Lege velden worden netjes weggelaten. */
export function vul(tekst, c, demoUrl = "", terugUrl = "") {
  const v = { voornaam: eerste(c.naam), naam: String(c.naam || "").trim(), bedrijf: String(c.bedrijf || "").trim(), plaats: String(c.plaats || "").trim(), openingszin: String(c.openingszin || "").trim(), demolink: demoUrl, terugbellink: terugUrl };
  return String(tekst || "").replace(/\{\{\s*(voornaam|naam|bedrijf|plaats|openingszin|demolink|terugbellink)\s*\}\}/gi, (_, k) => v[k.toLowerCase()]).replace(/[ \t]+([,.!?])/g, "$1").replace(/^(Hoi|Hallo|Goedendag) ,/m, "$1,");
}

/** @returns {{onderwerp: string, text: string, html: string}} */
export function bouw(sjabloon, contact, afmeldUrl, demoUrl = "", terugUrl = "", pixelUrl = "") {
  const onderwerp = vul(sjabloon.onderwerp, contact, demoUrl, terugUrl).replace(/\s+/g, " ").trim().slice(0, 200);
  const body = vul(sjabloon.tekst, contact, demoUrl, terugUrl).trim();
  const voet = `Liever geen mail meer van ons? Afmelden: ${afmeldUrl}\n${AFZENDER}`;
  const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#3a5bd9">${u}</a>`);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1b1f2a">` +
    body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, "<br>")}</p>`).join("") +
    `<p style="margin:24px 0 0;font-size:12px;color:#7a8091">Liever geen mail meer van ons? <a href="${esc(afmeldUrl)}" style="color:#7a8091">Afmelden</a><br>${esc(AFZENDER)}</p>${pixelUrl ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:none">` : ""}</div>`;
  return { onderwerp, text: body + "\n\n--\n" + voet, html };
}

/** Datum- en tijdonderdelen in Nederlandse tijd. */
export function nl(nu = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short", hour12: false }).formatToParts(nu).map((x) => [x.type, x.value]));
  const uur = +p.hour % 24, dag = p.weekday; // Mon..Sun
  const startVandaag = new Date(nu.getTime() - ((uur * 60 + +p.minute) * 60 + +p.second) * 1000);
  return { uur, dag, werkdag: !["Sat", "Sun"].includes(dag), startVandaag };
}

/**
 * Wie krijgt er nu een mail? Houdt rekening met verzendtijden, werkdagen, daglimiet en limiet per uur.
 * Opvolgmails gaan voor eerste mails.
 */
export function kies({ inst, nu = new Date(), vandaag = 0, laatsteUur = 0, wachtrij = [], opvolg = [], perRun = 10 }) {
  if (!inst || !inst.aan) return [];
  const t = nl(nu);
  if (t.uur < inst.van_uur || t.uur >= inst.tot_uur) return [];
  if (inst.alleen_werkdagen && !t.werkdag) return [];
  const ruimte = Math.min(inst.daglimiet - vandaag, inst.per_uur - laatsteUur, perRun);
  if (ruimte <= 0) return [];
  const uit = [];
  if (inst.opvolgen) for (const c of opvolg) { if (uit.length < ruimte) uit.push({ contact: c, type: "opvolg" }); }
  for (const c of wachtrij) { if (uit.length < ruimte) uit.push({ contact: c, type: "eerste" }); }
  return uit;
}

export const BASIS = () => (process.env.SERVAI_URL || process.env.URL || "https://servai.nl").replace(/\/$/, "");

/**
 * Verstuurt een lijst { contact, type } via Resend en werkt contacten en logboek bij.
 * @param rest  functie voor Supabase REST (service key)
 * @param sjablonen { eerste, opvolg }
 */
export async function verstuur(rest, { items, sjablonen, inst, from, replyTo, key, base = BASIS(), nu = new Date(), via = "resend", stuur, pauze = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const echt = items.filter((i) => i.contact && !i.contact.afgemeld && /^\S+@\S+\.\S+$/.test(i.contact.email || ""));
  if (!echt.length) return { verstuurd: 0, fout: null };
  const mails = [], meta = [];
  for (const { contact: c, type } of echt) {
    const sj = sjablonen[type];
    if (!sj) throw new Error(`Geen ${type === "opvolg" ? "opvolg" : "eerste"}-mailtekst ingesteld`);
    const afmeld = `${base}/api/afmelden?t=${c.afmeld_token}`, demo = `${base}/api/k?t=${c.afmeld_token}`, terug = `${base}/api/terugbellen?t=${c.afmeld_token}`, pixel = via === "smtp" ? `${base}/api/o?t=${c.afmeld_token}` : "";
    const m = bouw(sj, c, afmeld, demo, terug, pixel);
    mails.push({ from, to: [c.email.trim()], subject: m.onderwerp, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}), headers: { "List-Unsubscribe": `<${afmeld}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    meta.push({ c, type, onderwerp: m.onderwerp });
  }
  let res; // per mail: { ok, id, fout }
  if (via === "smtp") {
    res = [];
    for (let i = 0; i < mails.length; i++) {
      if (i) await pauze(1000 + Math.random() * 1000);
      const x = mails[i];
      try { const r = await stuur({ from: x.from, to: x.to[0], subject: x.subject, text: x.text, html: x.html, replyTo: x.reply_to, headers: x.headers }); res.push({ ok: true, id: r.id }); }
      catch (e) { res.push({ ok: false, fout: String(e.message || e).slice(0, 300) }); if (/Inloggen/.test(e.message)) { for (let j = i + 1; j < mails.length; j++) res.push({ ok: false, fout: e.message }); break; } }
    }
  } else {
    const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(mails) });
    const tekst = await r.text();
    let data = []; try { data = JSON.parse(tekst).data || []; } catch {}
    res = meta.map((_, i) => (r.ok ? { ok: true, id: data[i] ? data[i].id : null } : { ok: false, fout: tekst.slice(0, 300) }));
  }
  const log = meta.map((m, i) => ({ contact_id: m.c.id, type: m.type, aan: m.c.email, onderwerp: m.onderwerp, status: res[i].ok ? "verstuurd" : "fout", fout: res[i].ok ? null : res[i].fout, resend_id: res[i].ok ? res[i].id : null }));
  await rest("mail_verzonden", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(log) });
  const iso = nu.toISOString(), lijst = (t, ok) => meta.filter((m, i) => m.type === t && res[i].ok === ok).map((m) => m.c.id);
  const patch = (ids, body) => ids.length ? rest(`mail_contacten?id=in.(${ids.join(",")})`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(body) }) : null;
  for (let i = 0; i < meta.length; i++) if (!res[i].ok) await patch([meta[i].c.id], { status: "fout", fout: res[i].fout });
  await patch(lijst("eerste", true), { status: "gemaild", eerste_mail_op: iso, fout: null });
  await patch(lijst("opvolg", true), { status: "opgevolgd", opvolg_mail_op: iso, fout: null });
  const goed = res.filter((r) => r.ok).length, fouten = res.filter((r) => !r.ok);
  return { verstuurd: goed, fout: goed === 0 && fouten.length ? fouten[0].fout : null };
}
