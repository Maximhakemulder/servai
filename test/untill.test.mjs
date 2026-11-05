import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { transactiesNaarBonnen, urenNaarPakket, lokaalNaarIso, maakClient, haalPakket } from "../netlify/lib/untill.mjs";
import { normaliseer } from "../netlify/lib/kassa.mjs";
import { versleutel, ontsleutel } from "../netlify/lib/versleutel.mjs";
import { syncKoppeling } from "../netlify/lib/untill-sync.mjs";

const sd = {
  artikel: new Map([[1, { id: 1, name: "Cola", groupId: 10 }], [2, { id: 2, name: "Biefstuk", groupId: 20 }]]),
  groep: new Map([[10, "Bar"], [20, "Keuken"]]),
  betaling: new Map([[7, "PIN Maestro"], [8, "Contant"]]),
  gebruiker: new Map([[5, "Sanne"]]),
};
const transactie = {
  id: 900, closeDateTime: "2026-11-01T21:30:00", tableNumber: 12, tablePart: "a", covers: 2, userId: 5, discountOnTotal: 0,
  orders: [{ items: [
    { articleId: 1, quantity: 2, price: 7.0, vat: 1.21, vatPercent: 21 },
    { articleId: 2, quantity: 1, price: 24.5, vat: 2.02, vatPercent: 9 },
    { articleId: 1, quantity: 1, price: 3.5, vat: 0.61, vatPercent: 21, void: true },
  ] }],
  bills: [{ id: 1, dateTime: "2026-11-01T21:25:00", realDateTime: "2026-11-01T21:30:00", tip: 2, payments: [{ paymentId: 7, amount: 31.5 }] }],
};

test("tijdzone: winter en zomertijd", () => {
  assert.equal(lokaalNaarIso("2026-11-03T16:00:00"), "2026-11-03T15:00:00.000Z");
  assert.equal(lokaalNaarIso("2026-07-01T12:00:00"), "2026-07-01T10:00:00.000Z");
});

test("transactie wordt een geldige bon (void-regel telt niet mee)", () => {
  const bonnen = transactiesNaarBonnen([transactie, { id: 901, orders: [], bills: [] }], sd);
  assert.equal(bonnen.length, 1);
  const d = normaliseer({ bonnen }, { klant_id: "k", locatie_id: "l" });
  assert.deepEqual(d.fouten, []);
  assert.equal(d.bonnen[0].totaal, 31.5);
  assert.equal(d.bonnen[0].netto, 28.27);
  assert.equal(d.bonnen[0].betaalwijze, "pin");
  assert.equal(d.bonnen[0].medewerker, "Sanne");
  assert.equal(d.bonnen[0].tafel, "12a");
  assert.equal(d.bonnen[0].fooi, 2);
  assert.equal(d.regels.length, 2);
  assert.equal(d.regels[0].groep, "Bar");
});

test("uren per medewerker per dag, lopende registratie overgeslagen", () => {
  const u = urenNaarPakket([
    { userId: 5, start: "2026-11-01T17:00:00", stop: "2026-11-01T21:00:00", scaledDuration: 4 / 24, costs: 60 },
    { userId: 5, start: "2026-11-01T22:00:00", stop: "2026-11-01T23:00:00", scaledDuration: 1 / 24, costs: 15 },
    { userId: 5, start: "2026-11-02T17:00:00", stop: "1899-12-30T00:00:00", scaledDuration: 0, costs: 0 },
  ], sd);
  assert.deepEqual(u, [{ datum: "2026-11-01", medewerker: "Sanne", gewerkt: 5, kosten: 75 }]);
  assert.deepEqual(normaliseer({ uren: u }, { klant_id: "k", locatie_id: "l" }).fouten, []);
});

test("versleuteling: heen en terug, en geknoei wordt gezien", () => {
  process.env.KOPPELING_SLEUTEL = randomBytes(32).toString("base64");
  const t = versleutel({ user: "a", password: "b" });
  assert.deepEqual(ontsleutel(t), { user: "a", password: "b" });
  assert.throws(() => ontsleutel(t.slice(0, -4) + "AAAA"));
});

test("client stuurt Basic + AppToken en leest tegen nep-server", async () => {
  const calls = [];
  const fetchImpl = async (url, o) => { calls.push({ url, h: o.headers }); return { ok: true, json: async () => (url.includes("turnover-transaction") ? [transactie] : []), text: async () => "" }; };
  const c = maakClient({ host: "https://testapi.untill.com/shield/api", dbname: "DEMO", user: "u", password: "p", appToken: "tok", appNaam: "SERVAI", fetchImpl });
  const p = await haalPakket(c, sd, "2026-11-01T00:00:00", "2026-11-02T00:00:00");
  assert.equal(p.bonnen.length, 1);
  assert.match(calls[0].url, /^https:\/\/testapi\.untill\.com\/shield\/api\/v1\/DEMO\//);
  assert.equal(calls[0].h.apptoken, "tok:SERVAI");
  assert.equal(calls[0].h.authorization, "Basic " + Buffer.from("u:p").toString("base64"));
  process.env.UNTILL_APP_TOKEN = "envtok";
  assert.equal(typeof maakClient({ host: "https://x.nl", dbname: "d", user: "u", password: "p" }).get, "function");
  assert.throws(() => maakClient({ host: "ftp://x", dbname: "d", user: "u", password: "p", appToken: "t" }));
});

test("sync draait end-to-end met nep-Supabase en nep-unTill", async () => {
  const opgeslagen = { bonnen: [], verkoop: [], status: null };
  const rest = async (path, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    if (path.startsWith("bonnen")) opgeslagen.bonnen.push(...body);
    else if (path.startsWith("verkoop?locatie") && o.method === "DELETE") { /* oude regels wissen */ }
    else if (path.startsWith("verkoop")) opgeslagen.verkoop.push(...body);
    else if (path.startsWith("koppelingen")) opgeslagen.status = body;
    return { ok: true, text: async () => "", json: async () => [] };
  };
  const fetchImpl = async (url) => ({ ok: true, text: async () => "", json: async () => (url.includes("turnover-transaction") && url.includes("2026-11-02T") ? [transactie] : []) });
  const nu = new Date("2026-11-03T10:00:00Z");
  const res = await syncKoppeling(rest, { id: "kop", klant_id: "k", locatie_id: "l", sync_tot: "2026-11-02T08:00:00Z" },
    { host: "https://x.untill.com/api", dbname: "DEMO", user: "u", password: "p", appToken: "t" }, { nu, fetchImpl });
  assert.equal(res.ok, true);
  assert.ok(res.bonnen >= 1);
  assert.equal(opgeslagen.status.status, "ok");
  assert.equal(opgeslagen.status.sync_tot, nu.toISOString());
});

test("sync stopt netjes als de tijd op is en gaat later verder", async () => {
  const st = {};
  const rest = async (path, o = {}) => { if (path.startsWith("koppelingen")) Object.assign(st, JSON.parse(o.body)); return { ok: true, text: async () => "", json: async () => [] }; };
  const fetchImpl = async () => ({ ok: true, text: async () => "", json: async () => [] });
  const nu = new Date("2026-11-03T10:00:00Z");
  const res = await syncKoppeling(rest, { id: "k", klant_id: "k", locatie_id: "l", sync_tot: null },
    { host: "https://x.nl/api", dbname: "D", user: "u", password: "p", appToken: "t" }, { nu, fetchImpl, budgetMs: -1 });
  assert.equal(res.ok, true);
  assert.equal(res.compleet, false);
  assert.equal(st.status, "ok");
});

test("maakClient: http://IP:poort wordt geaccepteerd, andere schema's niet", () => {
  assert.equal(typeof maakClient({ host: "http://46.129.137.158:3063/shield/api", dbname: "d", user: "u", password: "p", appToken: "t" }).get, "function");
  assert.throws(() => maakClient({ host: "ftp://x.nl", dbname: "d", user: "u", password: "p", appToken: "t" }), /https/);
});
