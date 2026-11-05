import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL = "x"; process.env.SUPABASE_SERVICE_KEY = "y";
const { kiesKlant } = await import("../netlify/functions/facturen-inbox.mjs");
const klanten = [{ id: "k1", factuur_code: "ab12cd34" }, { id: "k2", factuur_code: "zz99" }];
const afz = [{ klant_id: "k2", email: "finance@bedrijf.nl" }];
test("kiest klant via plus-adres", () => assert.equal(kiesKlant({ aan: ["Facturen+ab12cd34@servai.nl"], van: "x@y.nl" }, klanten, afz), "k1"));
test("kiest klant via bekende afzender", () => assert.equal(kiesKlant({ aan: ["facturen@servai.nl"], van: "Finance@Bedrijf.nl" }, klanten, afz), "k2"));
test("onbekend geeft null", () => assert.equal(kiesKlant({ aan: ["facturen@servai.nl"], van: "spam@x.nl" }, klanten, afz), null));
