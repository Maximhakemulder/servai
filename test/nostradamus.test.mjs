import test from "node:test";
import assert from "node:assert";
import { vertaal, hhmm, maakClient } from "../netlify/lib/nostradamus.mjs";
const ctx = { klant_id: "k", locatie_id: "l" };
test("vertaal: rooster, gepland en gewerkt per medewerker, gefilterd op kantoor", () => {
  const d = vertaal({ office_id: 7,
    staff: [{ office_id: 7, card_id: 1, staff_name: "Sanne de Vries", card_hourly_salary: "14,50", card_salary_rate: 0 }, { office_id: 9, card_id: 5, staff_name: "Ander kantoor", card_hourly_salary: 20 }],
    planning: [{ office_id: 7, card_id: 1, planning_date: "2026-11-10", planning_start: "2026-11-10 17:00:00", planning_end: "2026-11-10 23:30:00", planning_hours: "6.5", planning_costs: "120.5", planning_workspace_name: "Bediening" },
               { office_id: 7, card_id: 0, planning_date: "2026-11-10", planning_hours: 5 },
               { office_id: 8, card_id: 2, planning_date: "2026-11-10", planning_hours: 4 }],
    uren: [{ hour_office_id: 7, card_id: 1, hour_date: "2026-11-05", hour_hours: 4 }, { hour_office_id: 7, card_id: 1, hour_date: "2026-11-05", hour_hours: 2.25 }] }, ctx);
  assert.equal(d.rooster.length, 1);
  assert.deepEqual([d.rooster[0].medewerker, d.rooster[0].begin_tijd, d.rooster[0].eind_tijd, d.rooster[0].uren, d.rooster[0].bron], ["Sanne de Vries", "17:00", "23:30", 6.5, "nostradamus"]);
  assert.equal(d.gepland[0].kosten, 120.5);
  assert.equal(d.gewerkt[0].gewerkt_uren, 6.25);
  assert.deepEqual(d.lonen.map((l) => [l.medewerker, l.uurloon, l.schaal]), [["Sanne de Vries", 14.5, null]]);
});
test("hhmm en klantnaam-controle", () => {
  assert.equal(hhmm("2026-11-10 07:05:00"), "07:05"); assert.equal(hhmm("2026-11-10T07:05:00"), "07:05"); assert.equal(hhmm("7:05"), "07:05"); assert.equal(hhmm("2026-11-10"), null);
  assert.throws(() => maakClient({ klant: "evil.com/x", api_key: "k" }));
});
