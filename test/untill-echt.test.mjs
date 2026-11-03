import test from "node:test";
import assert from "node:assert/strict";
import { transactiesNaarBonnen, urenNaarPakket, lokaleDatum } from "../netlify/lib/untill.mjs";
import { normaliseer } from "../netlify/lib/kassa.mjs";

// Ingekorte, echte uitkomst van testapi.untill.com (database DEMO), 3 november 2026.
const echt = [{ id: 75006725327, closeDateTime: "2026-10-01T04:00:04Z", tableNumber: 701, tablePart: "a", covers: 1, userId: 75006706369,
  orders: [
    { items: [{ articleId: 5000000607, kind: 1, quantity: 2, decimalQuantity: 2.0, singlePrice: 4.5, price: 9.0, discount: 0, vat: 1.5, vatPercent: 20, void: false }] },
    { items: [
      { articleId: 5000000734, kind: 1, quantity: 1, decimalQuantity: 1.0, price: 16.95, discount: 0, vat: 2.825, vatPercent: 20, void: false },
      { articleId: 5000000619, kind: 2, quantity: 1, decimalQuantity: 1.0, price: 1.0, discount: 0, vat: 0.1667, vatPercent: 20, void: false },
      { articleId: 5000000645, kind: 2, quantity: 1, decimalQuantity: 1.0, price: 0, discount: 0, vat: 0, vatPercent: 0, void: false },
    ] },
  ],
  bills: [{ id: 1, dateTime: "2026-10-01T04:00:04Z", realDateTime: "2026-10-01T04:00:04Z", tip: 0, payments: [{ paymentId: 5000000031, amount: 26.95 }] }] }];
const sd = { artikel: new Map([[5000000607, { name: "Cola", departmentId: 7 }], [5000000734, { name: "Burger", groupId: 1 }], [5000000619, { name: "Extra kaas" }]]),
  groep: new Map([[1, "Keuken"]]), afdeling: new Map([[7, "Dranken"]]), betaling: new Map([[5000000031, "PIN"]]), gebruiker: new Map() };

test("echte unTill-data: UTC-tijd, regeltotaal incl. btw, opties", () => {
  const bonnen = transactiesNaarBonnen(echt, sd);
  const d = normaliseer({ bonnen }, { klant_id: "k", locatie_id: "l" });
  assert.deepEqual(d.fouten, []);
  assert.equal(d.bonnen[0].tijdstip, "2026-10-01T04:00:04.000Z");
  assert.equal(d.bonnen[0].totaal, 26.95);
  assert.equal(d.regels.length, 3); // gratis optie valt weg
  assert.equal(d.bonnen[0].betaalwijze, "pin");
  assert.equal(d.regels[0].groep, "Dranken");
});

test("datum van een UTC-tijd is de Amsterdamse dag", () => {
  assert.equal(lokaleDatum("2026-10-31T23:30:00Z"), "2026-11-01"); // 00:30 in Amsterdam (na zomertijd 23:30Z = 00:30 CET)
  assert.equal(lokaleDatum("2026-11-01T17:00:00"), "2026-11-01");
  const u = urenNaarPakket([{ userId: 1, start: "2026-10-31T23:30:00Z", stop: "2026-11-01T03:30:00Z", scaledDuration: 4 / 24, costs: 50 }], { gebruiker: new Map() });
  assert.equal(u[0].datum, "2026-11-01");
});
