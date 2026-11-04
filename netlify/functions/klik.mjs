// Publiek: klik op de demolink in een B2B-mail. Registreert de klik (warme lead) en stuurt door naar de demo.
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const h = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal" };
export default async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";
  let doel = "https://servai.nl/demo/";
  if (URL_ && SVC) {
    try {
      const i = await (await fetch(`${URL_}/rest/v1/mail_instellingen?id=eq.1&select=demo_url`, { headers: h })).json();
      if (i[0] && /^https:\/\//.test(i[0].demo_url)) doel = i[0].demo_url;
      if (/^[0-9a-f-]{36}$/i.test(token)) {
        const nu = new Date().toISOString();
        const c = await (await fetch(`${URL_}/rest/v1/mail_contacten?afmeld_token=eq.${token}&select=id,geklikt_op`, { headers: h })).json();
        if (c[0]) {
          if (!c[0].geklikt_op) await fetch(`${URL_}/rest/v1/mail_contacten?id=eq.${c[0].id}`, { method: "PATCH", headers: h, body: JSON.stringify({ geklikt_op: nu }) });
          const m = await (await fetch(`${URL_}/rest/v1/mail_verzonden?contact_id=eq.${c[0].id}&type=in.(eerste,opvolg)&order=aangemaakt.desc&limit=1&select=id`, { headers: h })).json();
          if (m[0]) await fetch(`${URL_}/rest/v1/mail_verzonden?id=eq.${m[0].id}`, { method: "PATCH", headers: h, body: JSON.stringify({ geklikt_op: nu }) });
        }
      }
    } catch (_) {}
  }
  return new Response(null, { status: 302, headers: { location: doel, "cache-control": "no-store" } });
};
export const config = { path: "/api/k" };
