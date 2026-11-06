import test from "node:test"; import assert from "node:assert/strict";
import { weerUrl, parseWeer } from "../netlify/lib/weer.mjs";
test("zonder sleutel: gratis host", () => assert.match(weerUrl({ lat: 51.9, lon: 4.5, sleutel: "" }), /^https:\/\/api\.open-meteo\.com\/.*forecast_days=7/));
test("met sleutel: commerciële host + apikey", () => { const u = weerUrl({ lat: 51.9, lon: 4.5, sleutel: "abc", verleden: 3 }); assert.match(u, /customer-api/); assert.match(u, /apikey=abc/); assert.match(u, /past_days=3/); });
test("parseWeer", () => { const r = parseWeer({ daily: { time: ["2026-11-06"], weather_code: [3], temperature_2m_max: [11], temperature_2m_min: [6], precipitation_sum: [1.2], precipitation_probability_max: [40], wind_speed_10m_max: [22], sunshine_duration: [7200] } }); assert.deepEqual(r[0], { datum: "2026-11-06", code: 3, temp_max: 11, temp_min: 6, neerslag_mm: 1.2, regenkans: 40, wind_max: 22, zon_uren: 2 }); });
