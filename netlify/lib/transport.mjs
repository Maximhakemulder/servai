// Hoe verstuurt SERVAI zijn B2B-mail? Standaard via je eigen mailbox (SMTP, bijv. Hostnet); anders via Resend.
// SMTP:   MAIL_USER, MAIL_PASSWORD (optioneel MAIL_FROM, SMTP_HOST=smtp.hostnet.nl, SMTP_PORT=587, IMAP_HOST=imap.hostnet.nl, IMAP_PORT=993)
// Resend: RESEND_API_KEY + MAIL_VAN
const env = (k, d = "") => (process.env[k] || d).trim();
export function modus() {
  if (env("MAIL_USER") && env("MAIL_PASSWORD") && env("MAIL_TRANSPORT") !== "resend") return "smtp";
  if (env("RESEND_API_KEY") && env("MAIL_VAN")) return "resend";
  return null;
}
export const afzender = () => env("MAIL_FROM") || (env("MAIL_USER") ? `SERVAI <${env("MAIL_USER")}>` : env("MAIL_VAN"));
export const smtpConf = () => ({ host: env("SMTP_HOST", "smtp.hostnet.nl"), port: +env("SMTP_PORT", "587"), user: env("MAIL_USER"), pass: env("MAIL_PASSWORD") });
export const imapConf = () => ({ host: env("IMAP_HOST", "imap.hostnet.nl"), port: +env("IMAP_PORT", "993"), user: env("MAIL_USER"), pass: env("MAIL_PASSWORD") });
export const NIET_INGESTELD = "Mail is nog niet ingesteld: voeg MAIL_USER en MAIL_PASSWORD toe in Netlify (of RESEND_API_KEY en MAIL_VAN).";

let tp;
export async function smtpTransport() {
  if (tp) return tp;
  const { default: nodemailer } = await import("nodemailer");
  const c = smtpConf();
  tp = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, requireTLS: c.port !== 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  return tp;
}
/** Eén mail via SMTP. Geeft { id } (Message-ID) of gooit een fout met leesbare tekst. */
export async function stuurSmtp({ from, to, subject, text, html, replyTo, headers }) {
  try {
    const r = await (await smtpTransport()).sendMail({ from, to, subject, text, html, replyTo, headers });
    return { id: String(r.messageId || "").slice(0, 200) };
  } catch (e) {
    throw new Error(e && e.code === "EAUTH" ? "Inloggen bij de mailserver lukt niet. Controleer MAIL_USER en MAIL_PASSWORD." : `Versturen lukte niet (${(e && (e.code || e.responseCode)) || "verbinding"}).`);
  }
}
