// Ontvangt gebeurtenissen van Resend (afgeleverd, geopend, bounce, klacht). Handtekening (Svix) wordt gecontroleerd.
// Vereist: RESEND_WEBHOOK_SECRET (whsec_...). Stel in Resend het webhook-adres in op https://<jouw-site>/api/mail-webhook
import { createHmac, timingSafeEqual } from "node:crypto";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, SECRET = process.env.RESEND_WEBHOOK_SECRET;
const h = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal" };

export function klopt(secret, id, ts, body, header) {
  const sleutel = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  const verwacht = createHmac("sha256", sleutel).update(`${id}.${ts}.${body}`).digest();
  return String(header || "").split(" ").some((s) => {
    const [v, sig] = s.split(",");
    if (v !== "v1" || !sig) return false;
    const b = Buffer.from(sig, "base64");
    return b.length === verwacht.length && timingSafeEqual(b, verwacht);
  });
}

export default async (req) => {
  if (req.method !== "POST") return new Response("alleen POST", { status: 405 });
  if (!URL_ || !SVC || !SECRET) return new Response("niet ingesteld", { status: 503 });
  const body = await req.text();
  const id = req.headers.get("svix-id"), ts = req.headers.get("svix-timestamp");
  if (!id || !ts || Math.abs(Date.now() / 1000 - +ts) > 600 || !klopt(SECRET, id, ts, body, req.headers.get("svix-signature"))) return new Response("ongeldig", { status: 401 });
  let e; try { e = JSON.parse(body); } catch { return new Response("ongeldig", { status: 400 }); }
  const rid = e && e.data && e.data.email_id;
  if (!rid || !/^[\w-]{8,64}$/.test(rid)) return new Response("ok");
  const veld = { "email.delivered": "afgeleverd_op", "email.opened": "geopend_op", "email.bounced": "bounce_op", "email.complained": "klacht_op" }[e.type];
  if (!veld) return new Response("ok");
  const nu = new Date().toISOString();
  const m = await (await fetch(`${URL_}/rest/v1/mail_verzonden?resend_id=eq.${rid}&select=id,contact_id`, { headers: h })).json();
  if (!m[0]) return new Response("ok");
  await fetch(`${URL_}/rest/v1/mail_verzonden?id=eq.${m[0].id}&${veld}=is.null`, { method: "PATCH", headers: h, body: JSON.stringify({ [veld]: nu }) });
  if (m[0].contact_id && veld === "bounce_op") await fetch(`${URL_}/rest/v1/mail_contacten?id=eq.${m[0].contact_id}`, { method: "PATCH", headers: h, body: JSON.stringify({ status: "fout", fout: "Mail kwam niet aan (bounce)" }) });
  if (m[0].contact_id && veld === "klacht_op") await fetch(`${URL_}/rest/v1/mail_contacten?id=eq.${m[0].contact_id}`, { method: "PATCH", headers: h, body: JSON.stringify({ status: "afgemeld", afgemeld: true }) });
  return new Response("ok");
};
export const config = { path: "/api/mail-webhook" };
