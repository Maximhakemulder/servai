import test from "node:test";
import assert from "node:assert/strict";
import { vul, bouw, kies, nl } from "../netlify/lib/mail.mjs";

test("sjabloon vult voornaam, bedrijf, plaats en demolink en laat lege velden netjes weg", () => {
  const c = { naam: "Jan de Vries", bedrijf: "Grand Café Zon", plaats: "Utrecht" };
  assert.equal(vul("Hoi {{voornaam}}, voor {{bedrijf}} in {{plaats}}: {{demolink}}", c, "https://x/k"), "Hoi Jan, voor Grand Café Zon in Utrecht: https://x/k");
  assert.equal(vul("Hoi {{voornaam}}, tot snel", { bedrijf: "X" }), "Hoi, tot snel");
});
test("mail bevat afmeldlink, afzender en veilige html", () => {
  const m = bouw({ onderwerp: "Hallo {{bedrijf}}", tekst: "Hoi {{voornaam}}\n\nBekijk {{demolink}} <b>x</b>" }, { naam: "Piet", bedrijf: "Zon" }, "https://s/api/afmelden?t=abc", "https://s/api/k?t=abc");
  assert.equal(m.onderwerp, "Hallo Zon");
  assert.match(m.text, /Afmelden: https:\/\/s\/api\/afmelden\?t=abc/);
  assert.match(m.text, /KvK 86540440/);
  assert.match(m.html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(m.html, /<a href="https:\/\/s\/api\/k\?t=abc"/);
});
const inst = { aan: true, daglimiet: 50, per_uur: 12, van_uur: 8, tot_uur: 17, alleen_werkdagen: true, opvolgen: true };
const w = [1, 2, 3].map((i) => ({ id: "w" + i })), o = [{ id: "o1" }];
test("kies: alleen binnen verzendtijd, werkdagen en limieten; opvolg gaat voor", () => {
  const woe10 = new Date("2026-11-04T09:30:00Z"); // woensdag 10:30 NL
  const r = kies({ inst, nu: woe10, wachtrij: w, opvolg: o });
  assert.deepEqual(r.map((x) => x.type + x.contact.id), ["opvolgo1", "eerstew1", "eerstew2", "eerstew3"]);
  assert.equal(kies({ inst: { ...inst, aan: false }, nu: woe10, wachtrij: w }).length, 0);
  assert.equal(kies({ inst, nu: new Date("2026-11-04T18:30:00Z"), wachtrij: w }).length, 0);      // 19:30
  assert.equal(kies({ inst, nu: new Date("2026-11-07T10:00:00Z"), wachtrij: w }).length, 0);      // zaterdag
  assert.equal(kies({ inst, nu: woe10, vandaag: 49, wachtrij: w }).length, 1);                    // daglimiet
  assert.equal(kies({ inst, nu: woe10, laatsteUur: 11, wachtrij: w }).length, 1);                 // per uur
  assert.equal(kies({ inst: { ...inst, opvolgen: false }, nu: woe10, opvolg: o }).length, 0);
  assert.equal(nl(woe10).uur, 10);
});

import { createHmac } from "node:crypto";
import { klopt } from "../netlify/functions/mail-webhook.mjs";
test("webhook-handtekening: juist, fout en vervalst", () => {
  const secret = "whsec_" + Buffer.from("geheim").toString("base64");
  const sig = "v1," + createHmac("sha256", Buffer.from("geheim")).update("id1.1700000000.{\"a\":1}").digest("base64");
  assert.equal(klopt(secret, "id1", "1700000000", "{\"a\":1}", sig), true);
  assert.equal(klopt(secret, "id1", "1700000000", "{\"a\":2}", sig), false);
  assert.equal(klopt(secret, "id1", "1700000000", "{\"a\":1}", "v1,AAAA"), false);
});

import { schoon } from "../netlify/functions/leads-import.mjs";
test("scraper-import: schoont adressen, dubbele en ongeldige weg", () => {
  const r = schoon([{ email: " Info@Zon.nl ", bedrijf: "Zon" }, { email: "info@zon.nl" }, { email: "geen-mail" }, { bedrijf: "x" }, { email: "b@c.nl", openingszin: "Hoi" }]);
  assert.deepEqual(r.uit.map((x) => x.email), ["info@zon.nl", "b@c.nl"]);
  assert.equal(r.ongeldig, 2);
  assert.equal(r.uit[0].status, "te_keuren"); assert.equal(r.uit[0].bron, "scraper");
});

import { uitOutscraper } from "../netlify/functions/scout.mjs";
test("uitOutscraper: pakt eerste mail, slaat zaken zonder mail en gesloten zaken over", () => {
  const r = uitOutscraper([[{ name: "A", city: "Utrecht", site: "a.nl", email_1: "Info@A.nl" }, { name: "B" }, { name: "C", emails: ["x"], business_status: "CLOSED_PERMANENTLY", email_1: "c@c.nl" }, { name: "D", emails: [{ value: "d@d.nl" }] }]], "restaurant");
  assert.equal(r.gevonden, 4); assert.equal(r.zonderMail, 1); assert.equal(r.leads.length, 2);
  assert.equal(r.leads[0].email, "Info@A.nl"); assert.equal(r.leads[1].email, "d@d.nl"); assert.equal(r.leads[0].soort, "restaurant");
});

import { beoordeel } from "../netlify/functions/inbox.mjs";
import { modus } from "../netlify/lib/transport.mjs";
test("beoordeel: reactie, stop en bounce", () => {
  const cs = [{ id: 1, email: "a@x.nl" }, { id: 2, email: "b@y.nl" }];
  assert.equal(beoordeel({ van: "A@x.nl", tekst: "Leuk, bel me maar" }, cs, new Map()).soort, "reactie");
  assert.equal(beoordeel({ van: "a@x.nl", tekst: "Graag afmelden a.u.b." }, cs, new Map()).soort, "stop");
  const b = beoordeel({ van: "MAILER-DAEMON@h.nl", tekst: "Delivery to b@y.nl failed" }, cs, new Map());
  assert.equal(b.soort, "bounce"); assert.equal(b.contact.id, 2);
  assert.equal(beoordeel({ van: "z@z.nl", tekst: "hoi" }, cs, new Map()), null);
});
test("modus: SMTP gaat voor Resend, anders null", () => {
  const bewaar = { ...process.env };
  for (const k of ["MAIL_USER", "MAIL_PASSWORD", "RESEND_API_KEY", "MAIL_VAN", "MAIL_TRANSPORT"]) delete process.env[k];
  assert.equal(modus(), null);
  process.env.RESEND_API_KEY = "k"; process.env.MAIL_VAN = "a@b.nl"; assert.equal(modus(), "resend");
  process.env.MAIL_USER = "u"; process.env.MAIL_PASSWORD = "p"; assert.equal(modus(), "smtp");
  Object.assign(process.env, bewaar);
});
test("verstuur via SMTP: logt, markeert status en gebruikt pixel", async () => {
  const { verstuur } = await import("../netlify/lib/mail.mjs");
  const calls = [], verstuurd = [];
  const rest = async (p, o = {}) => { calls.push([p, o.body]); return { ok: true, json: async () => [] }; };
  const c = { id: "c1", email: "a@x.nl", naam: "Jan", afmeld_token: "t-1" };
  const r = await verstuur(rest, { items: [{ contact: c, type: "eerste" }], sjablonen: { eerste: { onderwerp: "Hoi", tekst: "Tekst {{demolink}}" } }, inst: {}, from: "S <s@x.nl>", via: "smtp", stuur: async (m) => { verstuurd.push(m); return { id: "<id1>" }; }, pauze: async () => {} });
  assert.equal(r.verstuurd, 1); assert.equal(r.fout, null);
  assert.match(verstuurd[0].html, /\/api\/o\?t=t-1/);
  assert.ok(calls.some(([p, b]) => p === "mail_verzonden" && b.includes("<id1>")));
  assert.ok(calls.some(([p, b]) => p.startsWith("mail_contacten") && b.includes("gemaild")));
});
