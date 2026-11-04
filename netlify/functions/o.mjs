// Openingspixel (alleen bij versturen via SMTP): markeert de laatste mail aan dit contact als geopend. Een indicatie, geen zekerheid.
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const h = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal" };
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const plaatje = () => new Response(GIF, { status: 200, headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
export default async (req) => {
  try {
    const t = new URL(req.url).searchParams.get("t") || "";
    if (URL_ && SVC && /^[0-9a-f-]{36}$/i.test(t)) {
      const c = await (await fetch(`${URL_}/rest/v1/mail_contacten?afmeld_token=eq.${t}&select=id`, { headers: h })).json();
      if (c[0]) {
        const m = await (await fetch(`${URL_}/rest/v1/mail_verzonden?contact_id=eq.${c[0].id}&status=eq.verstuurd&geopend_op=is.null&order=aangemaakt.desc&limit=1&select=id`, { headers: h })).json();
        if (m[0]) await fetch(`${URL_}/rest/v1/mail_verzonden?id=eq.${m[0].id}`, { method: "PATCH", headers: h, body: JSON.stringify({ geopend_op: new Date().toISOString() }) });
      }
    }
  } catch {}
  return plaatje();
};
export const config = { path: "/api/o" };
