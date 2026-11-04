import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_ANON_KEY = "a"; process.env.SUPABASE_SERVICE_KEY = "s";
const { default: upload } = await import("../netlify/functions/upload.mjs");

const L1 = "11111111-1111-1111-1111-111111111111", L2 = "22222222-2222-2222-2222-222222222222";
function mock({ beheerder = false, profiel = null }) {
  const geschreven = [];
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url), ok = (o) => new Response(JSON.stringify(o), { status: 200 });
    if (u.includes("/auth/v1/user")) return ok({ id: "u1" });
    if (u.includes("platform_beheerders")) return ok(beheerder ? [{ user_id: "u1" }] : []);
    if (u.includes("profielen?")) return ok(profiel ? [profiel] : []);
    if (u.includes("locaties?")) return ok(u.includes(L1) ? [{ id: L1, klant_id: "K1" }] : u.includes(L2) ? [{ id: L2, klant_id: "K2" }] : []);
    if (opt.method === "POST") { geschreven.push({ u, body: JSON.parse(opt.body) }); return new Response("", { status: 201 }); }
    return ok([]);
  };
  return geschreven;
}
const roep = (body) => upload(new Request("https://s/api/upload", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify(body) }));
const uren = [{ datum: "2026-11-03", medewerker: "Eva", gepland: 6, gewerkt: 7, kosten: 100 }];

test("eigenaar mag eigen locatie; rooster-upload stuurt alleen geplande uren mee", async () => {
  const w = mock({ profiel: { klant_id: "K1", rol: "eigenaar", locatie_id: null, actief: true } });
  const r = await roep({ locatie_id: L1, soort: "gepland", rijen: uren });
  assert.equal(r.status, 200);
  const rij = w.find((x) => x.u.includes("/uren"))?.body[0];
  assert.deepEqual(Object.keys(rij).sort(), ["datum", "gepland_uren", "klant_id", "locatie_id", "medewerker"]);
});
test("gewerkte uren sturen geen geplande uren mee", async () => {
  const w = mock({ profiel: { klant_id: "K1", rol: "bedrijfsleider", locatie_id: L1, actief: true } });
  assert.equal((await roep({ locatie_id: L1, soort: "gewerkt", rijen: uren })).status, 200);
  const rij = w.find((x) => x.u.includes("/uren")).body[0];
  assert.equal(rij.gewerkt_uren, 7); assert.equal(rij.kosten, 100); assert.equal("gepland_uren" in rij, false);
});
test("andere klant, andere locatie, chef en niet-ingelogde profielen worden geweigerd", async () => {
  mock({ profiel: { klant_id: "K1", rol: "eigenaar", locatie_id: null, actief: true } });
  assert.equal((await roep({ locatie_id: L2, soort: "gewerkt", rijen: uren })).status, 403);
  mock({ profiel: { klant_id: "K1", rol: "bedrijfsleider", locatie_id: "99999999-9999-9999-9999-999999999999", actief: true } });
  assert.equal((await roep({ locatie_id: L1, soort: "gewerkt", rijen: uren })).status, 403);
  mock({ profiel: { klant_id: "K1", rol: "chef", locatie_id: null, actief: true } });
  assert.equal((await roep({ locatie_id: L1, soort: "gewerkt", rijen: uren })).status, 403);
  mock({ profiel: null });
  assert.equal((await roep({ locatie_id: L1, soort: "gewerkt", rijen: uren })).status, 403);
});
test("boekhouder mag alleen inkoop", async () => {
  const w = mock({ profiel: { klant_id: "K1", rol: "boekhouder", locatie_id: null, actief: true } });
  assert.equal((await roep({ locatie_id: L1, soort: "gewerkt", rijen: uren })).status, 403);
  const r = await roep({ locatie_id: L1, soort: "inkoop", rijen: [{ datum: "2026-11-03", leverancier: "Hanos", bedrag: 50 }] });
  assert.equal(r.status, 200);
  assert.equal(w.find((x) => x.u.includes("/inkoop")).body[0].leverancier, "Hanos");
});
