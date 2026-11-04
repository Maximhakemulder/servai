// SERVAI · de mailer: elke 10 minuten kijkt hij of er mails verstuurd mogen worden (verzendtijden, daglimiet, limiet per uur)
// en stuurt de volgende leads uit de wachtrij. Opvolgmails gaan automatisch na X dagen zonder reactie of klik.
import { kies, nl, verstuur } from "../lib/mail.mjs";
import { modus, afzender, stuurSmtp } from "../lib/transport.mjs";
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY;
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=representation", ...(opt.headers || {}) } });
const get = async (p) => { const r = await rest(p); return r.ok ? r.json() : []; };

export default async () => {
  const via = modus(), KEY = process.env.RESEND_API_KEY;
  if (!URL_ || !SVC || !via) return new Response("niet ingesteld");
  const inst = (await get("mail_instellingen?id=eq.1&select=*"))[0];
  if (!inst || !inst.aan) return new Response("mailer staat uit");
  const nu = new Date(), t = nl(nu);
  const tel = async (sinds) => (await rest(`mail_verzonden?type=in.(eerste,opvolg)&status=eq.verstuurd&aangemaakt=gte.${encodeURIComponent(sinds.toISOString())}&select=id`, { headers: { prefer: "count=exact", range: "0-0" } })).headers.get("content-range")?.split("/")[1] | 0;
  const vandaag = await tel(t.startVandaag), laatsteUur = await tel(new Date(nu.getTime() - 36e5));
  const grens = new Date(nu.getTime() - inst.opvolg_na_dagen * 864e5).toISOString();
  const [wachtrij, opvolg] = await Promise.all([
    get("mail_contacten?status=eq.wachtrij&afgemeld=eq.false&order=aangemaakt.asc&limit=20&select=*"),
    inst.opvolgen ? get(`mail_contacten?status=eq.gemaild&afgemeld=eq.false&gereageerd=eq.false&geklikt_op=is.null&opvolg_mail_op=is.null&eerste_mail_op=lte.${encodeURIComponent(grens)}&order=eerste_mail_op.asc&limit=20&select=*`) : [],
  ]);
  const items = kies({ inst, nu, vandaag, laatsteUur, wachtrij, opvolg });
  if (!items.length) return new Response("niets te doen");
  const ids = [inst.eerste_sjabloon_id, inst.opvolg_sjabloon_id].filter(Boolean);
  const sj = ids.length ? await get(`mail_sjablonen?id=in.(${ids.join(",")})&select=*`) : [];
  const sjablonen = { eerste: sj.find((x) => x.id === inst.eerste_sjabloon_id), opvolg: sj.find((x) => x.id === inst.opvolg_sjabloon_id) };
  const r = await verstuur(rest, { items: items.filter((i) => sjablonen[i.type]), sjablonen, inst, from: afzender(), replyTo: process.env.MAIL_ANTWOORD || undefined, key: KEY, nu, via, stuur: stuurSmtp });
  return new Response(JSON.stringify(r));
};
export const config = { schedule: "*/10 * * * *" };
