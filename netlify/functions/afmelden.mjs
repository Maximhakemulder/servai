// Publiek: afmelden voor B2B-mail via de link in de mail (en one-click via List-Unsubscribe-Post).
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const pagina = (t) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Afmelden</title><body style="font-family:Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#1b1f2a"><h1 style="font-size:22px">${t}</h1><p style="color:#5b6275">SERVAI · MH Holding B.V.</p></body>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
export default async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!URL_ || !SVC) return pagina("Afmelden is nu niet mogelijk. Mail naar hallo@servai.nl.");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return pagina("Deze link is ongeldig.");
  const r = await fetch(`${URL_}/rest/v1/mail_contacten?afmeld_token=eq.${token}`, { method: "PATCH", headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify({ afgemeld: true, status: "afgemeld" }) });
  if (!r.ok) return pagina("Afmelden is mislukt. Mail naar hallo@servai.nl.");
  return pagina("Je bent afgemeld. Je ontvangt geen mail meer van ons.");
};
export const config = { path: "/api/afmelden" };
