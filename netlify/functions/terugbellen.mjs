// Publiek: "Bel mij terug / plan een demo" vanuit een B2B-mail. GET toont een klein formulier, POST maakt een aanvraag aan in /beheer.
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pag = (inhoud, s = 200) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SERVAI</title><body style="font-family:Arial,sans-serif;max-width:460px;margin:10vh auto;padding:0 20px;color:#1b1f2a">${inhoud}<p style="color:#7a8091;font-size:13px;margin-top:28px">SERVAI · MH Holding B.V.</p></body>`, { status: s, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const UUID = /^[0-9a-f-]{36}$/i;
const zoek = async (t) => { const r = await fetch(`${URL_}/rest/v1/mail_contacten?afmeld_token=eq.${t}&select=id,naam,bedrijf,email,telefoon`, { headers: H }); return r.ok ? (await r.json())[0] : null; };

export default async (req) => {
  if (!URL_ || !SVC) return pag("<h1>Even niet beschikbaar</h1><p>Mail ons op hallo@servai.nl of bel 06 19 92 12 22.</p>", 503);
  const u = new URL(req.url), t = u.searchParams.get("t") || "";
  if (!UUID.test(t)) return pag("<h1>Deze link is ongeldig</h1><p>Mail ons op hallo@servai.nl.</p>", 400);
  const c = await zoek(t);
  if (req.method === "POST") {
    const f = await req.formData().catch(() => null);
    const tel = String((f && f.get("telefoon")) || "").trim().slice(0, 40), wanneer = String((f && f.get("wanneer")) || "").trim().slice(0, 200);
    if (!c) return pag("<h1>Deze link is ongeldig</h1>", 400);
    if (tel.replace(/\D/g, "").length < 8) return pag(`<h1>Terugbellen</h1><p style="color:#b3261e">Vul een geldig telefoonnummer in.</p>${formulier(t, c, tel, wanneer)}`, 422);
    const r = await fetch(`${URL_}/rest/v1/aanvragen`, { method: "POST", headers: H, body: JSON.stringify({ naam: (c.naam || c.bedrijf || c.email).slice(0, 120), bedrijf: (c.bedrijf || "").slice(0, 160) || null, email: c.email, telefoon: tel, interesse: "Terugbelverzoek of demo (B2B-mail)", bericht: wanneer ? `Wil graag teruggebeld worden: ${wanneer}` : "Wil graag teruggebeld worden / een demo inplannen" }) });
    if (!r.ok) return pag("<h1>Er ging iets mis</h1><p>Bel ons gerust op 06 19 92 12 22.</p>", 502);
    await fetch(`${URL_}/rest/v1/mail_contacten?id=eq.${c.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ gereageerd: true, telefoon: tel }) });
    return pag("<h1>Bedankt!</h1><p>We bellen je zo snel mogelijk terug om een demo in te plannen.</p>");
  }
  if (!c) return pag("<h1>Deze link is ongeldig</h1>", 400);
  return pag(`<h1>Bel mij terug</h1><p style="color:#5b6275">Laat je nummer achter, dan bellen we je terug en plannen we samen een demo in.</p>${formulier(t, c, c.telefoon || "", "")}`);
};
function formulier(t, c, tel, wanneer) {
  const veld = "width:100%;box-sizing:border-box;padding:12px;border:1px solid #c9cedb;border-radius:10px;font-size:16px;margin:4px 0 14px";
  return `<form method="post" action="/api/terugbellen?t=${esc(t)}"><label>Telefoonnummer<input name="telefoon" type="tel" required value="${esc(tel)}" style="${veld}"></label><label>Wanneer kunnen we bellen? (optioneel)<input name="wanneer" value="${esc(wanneer)}" placeholder="Bijvoorbeeld: morgenochtend" style="${veld}"></label><button style="padding:13px 22px;border:0;border-radius:10px;background:#1b1f2a;color:#fff;font-size:16px;cursor:pointer">Bel mij terug</button></form>`;
}
export const config = { path: "/api/terugbellen" };
