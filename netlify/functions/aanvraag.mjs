// Ontvangt het demoformulier van de homepage en zet het in Supabase (tabel "aanvragen").
// Publiek bereikbaar, dus: alleen POST, lengtes begrensd, verborgen veld tegen bots, geen gegevens terug.
const URL_ = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_KEY;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const t = (v, m) => (typeof v === "string" ? v.trim().slice(0, m) : "");

export default async (req) => {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !SVC) return json({ error: "niet ingesteld" }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ error: "ongeldig" }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: bots vullen dit veld in
  const naam = t(b.naam, 120), email = t(b.email, 200);
  if (!naam || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Vul je naam en een geldig e-mailadres in." }, 400);
  const r = await fetch(`${URL_}/rest/v1/aanvragen`, {
    method: "POST",
    headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ naam, bedrijf: t(b.bedrijf, 160) || null, email, telefoon: t(b.telefoon, 40) || null, aantal_locaties: t(b.locaties, 60) || null, interesse: t(b.interesse, 120) || null, bericht: t(b.bericht, 2000) || null, bron: "homepage" }),
  });
  if (!r.ok) return json({ error: "Opslaan mislukt, probeer het later opnieuw." }, 502);
  return json({ ok: true });
};

export const config = { path: "/api/aanvraag" };
