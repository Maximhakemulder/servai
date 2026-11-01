// SERVAI · beheeracties die de geheime sleutel nodig hebben (klant aanmaken, gebruiker uitnodigen, wachtwoordmail).
// De browser stuurt zijn inlogtoken mee. Wij controleren wie het is voordat we iets doen.
// Vereist in Netlify: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (scope: Functions).

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_KEY;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const rest = (path, opt = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...opt,
    headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json", prefer: "return=representation", ...(opt.headers || {}) },
  });

async function wie(req) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return null;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${t}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function isBeheerder(id) {
  const r = await rest(`platform_beheerders?user_id=eq.${id}&select=user_id`);
  const a = r.ok ? await r.json() : [];
  return a.length > 0;
}

const mailOk = (e) => typeof e === "string" && /^\S+@\S+\.\S+$/.test(e) && e.length < 200;
const tekst = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ROLLEN = ["eigenaar", "bedrijfsleider", "chef", "boekhouder", "bar", "gastvrouw"];
const ALLE_PAGINAS = ["overzicht","financien","menu","dranken","kansen","personeel","upselling","reserveringen","inkoop","gasten","assistent","meldingen","advies","koppelingen","gebruikers","support","loonkosten"];

async function logboek(klant_id, user_id, actie, details) {
  try { await rest("logboek", { method: "POST", body: JSON.stringify({ klant_id: klant_id || null, user_id, actie, details: details || {} }) }); } catch (_) {}
}

// Nodigt een gebruiker uit (of vindt hem als hij al bestaat) en geeft zijn user-id terug.
async function nodigUit(email, naam, origin) {
  const r = await fetch(`${URL_}/auth/v1/invite?redirect_to=${encodeURIComponent(origin + "/dashboard/")}`, {
    method: "POST",
    headers: { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" },
    body: JSON.stringify({ email, data: { naam } }),
  });
  if (r.ok) { const u = await r.json(); return { id: u.id, nieuw: true }; }
  // bestaat al? zoek hem op
  for (let page = 1; page <= 10; page++) {
    const l = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } });
    if (!l.ok) break;
    const d = await l.json();
    const lijst = d.users || [];
    const g = lijst.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (g) return { id: g.id, nieuw: false };
    if (lijst.length < 200) break;
  }
  const fout = await r.text();
  throw new Error("Uitnodigen mislukt: " + fout.slice(0, 200));
}

async function maakProfiel(klant_id, p) {
  const rol = ROLLEN.includes(p.rol) ? p.rol : "bedrijfsleider";
  const toegang = Array.isArray(p.toegang) && p.toegang.length ? p.toegang.filter((x) => ALLE_PAGINAS.includes(x)) : rol === "eigenaar" ? ALLE_PAGINAS : ["overzicht", "loonkosten"];
  const r = await rest("profielen?on_conflict=id", {
    method: "POST",
    headers: { prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ id: p.id, klant_id, naam: p.naam, email: p.email, rol, locatie_id: p.locatie_id || null, toegang, actief: true }),
  });
  if (!r.ok) throw new Error("Profiel opslaan mislukt: " + (await r.text()).slice(0, 200));
  return (await r.json())[0];
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "alleen POST" }, 405);
  if (!URL_ || !ANON || !SVC) return json({ error: "Server niet ingesteld (SUPABASE_*)" }, 503);

  const u = await wie(req);
  if (!u) return json({ error: "Niet ingelogd" }, 401);

  let b;
  try { b = await req.json(); } catch { return json({ error: "Ongeldige invoer" }, 400); }
  const origin = new URL(req.url).origin;
  const beheerder = await isBeheerder(u.id);

  try {
    // ---------------------------------------------------------- nieuwe klant
    if (b.actie === "klant_aanmaken") {
      if (!beheerder) return json({ error: "Geen toegang" }, 403);
      const naam = tekst(b.naam, 120);
      const eig = b.eigenaar || {};
      const locs = (Array.isArray(b.locaties) ? b.locaties : []).map((x) => tekst(x, 80)).filter(Boolean).slice(0, 50);
      if (!naam) return json({ error: "Vul de naam van de klant in" }, 400);
      if (!locs.length) return json({ error: "Vul minstens één locatie in" }, 400);
      if (!tekst(eig.naam) || !mailOk(eig.email)) return json({ error: "Vul naam en een geldig e-mailadres van de eigenaar in" }, 400);

      const kr = await rest("klanten", { method: "POST", body: JSON.stringify({ naam, loonnorm_pct: Number(b.loonnorm_pct) || 30, contact_naam: tekst(eig.naam), contact_email: eig.email.trim(), contact_tel: tekst(eig.tel, 40) || null, notities: tekst(b.notities, 2000) || null }) });
      if (!kr.ok) throw new Error("Klant aanmaken mislukt: " + (await kr.text()).slice(0, 200));
      const klant = (await kr.json())[0];

      const lr = await rest("locaties", { method: "POST", body: JSON.stringify(locs.map((l) => ({ klant_id: klant.id, naam: l }))) });
      if (!lr.ok) throw new Error("Locaties aanmaken mislukt");

      // abonnement
      let plan = null;
      if (b.plan_code) { const pr = await rest(`plannen?code=eq.${encodeURIComponent(b.plan_code)}&select=*`); const pa = pr.ok ? await pr.json() : []; plan = pa[0] || null; }
      const proefDagen = Number.isFinite(+b.proef_dagen) ? Math.max(0, Math.min(90, +b.proef_dagen)) : 14;
      const status = b.status === "actief" ? "actief" : "proef";
      const vandaag = new Date();
      const proefTot = status === "proef" ? new Date(vandaag.getTime() + proefDagen * 864e5).toISOString().slice(0, 10) : null;
      const prijs = b.prijs_maand != null && b.prijs_maand !== "" ? Number(b.prijs_maand) : (plan ? plan.prijs_per_locatie * locs.length : 0);
      await rest("abonnementen", { method: "POST", body: JSON.stringify({ klant_id: klant.id, plan_id: plan ? plan.id : null, status, aantal_locaties: locs.length, prijs_maand: prijs, proef_tot: proefTot, start_datum: vandaag.toISOString().slice(0, 10) }) });

      // eigenaar uitnodigen
      const inv = await nodigUit(eig.email.trim(), tekst(eig.naam), origin);
      await maakProfiel(klant.id, { id: inv.id, naam: tekst(eig.naam), email: eig.email.trim(), rol: "eigenaar" });

      // aanvraag koppelen
      if (b.aanvraag_id) await rest(`aanvragen?id=eq.${Number(b.aanvraag_id)}`, { method: "PATCH", body: JSON.stringify({ status: "klant", klant_id: klant.id }) });

      await logboek(klant.id, u.id, "klant_aangemaakt", { naam, locaties: locs.length });
      return json({ ok: true, klant_id: klant.id, uitnodiging: inv.nieuw ? "verstuurd" : "bestond_al" });
    }

    // ---------------------------------------------------------- gebruiker uitnodigen
    if (b.actie === "gebruiker_uitnodigen") {
      const klant_id = tekst(b.klant_id, 40);
      if (!klant_id) return json({ error: "Klant ontbreekt" }, 400);
      if (!beheerder) {
        // een eigenaar mag collega's uitnodigen binnen zijn eigen klant
        const pr = await rest(`profielen?id=eq.${u.id}&select=klant_id,rol,actief`);
        const p = pr.ok ? (await pr.json())[0] : null;
        if (!p || !p.actief || p.rol !== "eigenaar" || p.klant_id !== klant_id) return json({ error: "Geen toegang" }, 403);
        if (b.rol === "eigenaar") return json({ error: "Alleen SERVAI kan een eigenaar toevoegen" }, 403);
      }
      const naam = tekst(b.naam, 120), email = tekst(b.email, 200);
      if (!naam || !mailOk(email)) return json({ error: "Vul een naam en een geldig e-mailadres in" }, 400);
      const inv = await nodigUit(email, naam, origin);
      const prof = await maakProfiel(klant_id, { id: inv.id, naam, email, rol: b.rol, locatie_id: b.locatie_id, toegang: b.toegang });
      await logboek(klant_id, u.id, "gebruiker_uitgenodigd", { email, rol: prof.rol });
      return json({ ok: true, uitnodiging: inv.nieuw ? "verstuurd" : "bestond_al" });
    }

    // ---------------------------------------------------------- wachtwoordmail opnieuw sturen
    if (b.actie === "wachtwoordmail") {
      if (!beheerder) return json({ error: "Geen toegang" }, 403);
      const pr = await rest(`profielen?id=eq.${tekst(b.profiel_id, 40)}&select=email,klant_id`);
      const p = pr.ok ? (await pr.json())[0] : null;
      if (!p) return json({ error: "Gebruiker niet gevonden" }, 404);
      const r = await fetch(`${URL_}/auth/v1/recover?redirect_to=${encodeURIComponent(origin + "/dashboard/")}`, {
        method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: p.email }),
      });
      if (!r.ok) throw new Error("Mail versturen mislukt: " + (await r.text()).slice(0, 160));
      await logboek(p.klant_id, u.id, "wachtwoordmail", { email: p.email });
      return json({ ok: true });
    }

    // ---------------------------------------------------------- beheerder bekijkt het dashboard van een klant (alleen vastleggen)
    if (b.actie === "bekijk_als") {
      if (!beheerder) return json({ error: "Geen toegang" }, 403);
      await logboek(tekst(b.klant_id, 40), u.id, "bekijk_als", { email: u.email });
      return json({ ok: true });
    }

    return json({ error: "Onbekende actie" }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

export const config = { path: "/api/beheer" };
