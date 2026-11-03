// SERVAI · unTill Prime REST API (alleen lezen) → standaard kassaformaat (zie kassa.mjs en docs/dataformaat.md).
// Authenticatie: Basic (gebruiker + wachtwoord uit unTill Backoffice) + header AppToken.
// De gebruiker heeft alleen "Backoffice view" en "Reporting" nodig.

const TZ = "Europe/Amsterdam";
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const getal = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** unTill levert tijden zonder tijdzone (lokale tijd). Zet om naar ISO met de juiste Amsterdamse offset. */
export function lokaalNaarIso(s, tz = TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(s))) return new Date(s).toISOString();
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  const utcGok = Date.UTC(y, mo - 1, d, h, mi, se);
  const offset = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  let t = utcGok - offset(utcGok);
  t = utcGok - offset(t);
  return new Date(t).toISOString();
}

/** Datum (YYYY-MM-DD) van een unTill-tijd in Amsterdamse tijd. unTill levert UTC met "Z"; zonder Z nemen we de datum zoals die er staat. */
export const lokaleDatum = (s) => {
  const t = String(s || "");
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) { const d = new Date(t); return isNaN(d) ? null : naarLokaal(d).slice(0, 10); }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t); return m ? m[1] : null;
};

/** Tijdvenster voor de API: unTill rekent in UTC. */
export const naarUtc = (date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Formatteert een Date als lokale tijd zonder tijdzone, zoals unTill die teruggeeft. */
export function naarLokaal(date, tz = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

const betaalSoort = (naam) => {
  const n = String(naam || "").toLowerCase();
  if (/pin|maestro|debit|bancontact|eft|v ?pay/.test(n)) return "pin";
  if (/contant|cash|kas/.test(n)) return "contant";
  if (/credit|visa|master|amex/.test(n)) return "creditcard";
  return naam ? String(naam).slice(0, 40) : null;
};

/**
 * Eenvoudige client voor de REST API.
 * @param {{host: string, dbname: string, user: string, password: string, appToken?: string, appNaam?: string, fetchImpl?: typeof fetch}} cfg
 * host = basis van de API, bijvoorbeeld https://testapi.untill.com/shield/api (zonder /v1/...)
 */
export function maakClient(cfg) {
  const f = cfg.fetchImpl || fetch;
  const base = String(cfg.host || "").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("host moet met https:// beginnen");
  const auth = "Basic " + Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64");
  const appToken = cfg.appToken || process.env.UNTILL_APP_TOKEN, appNaam = cfg.appNaam || process.env.UNTILL_APP_NAAM;
  if (!appToken) throw new Error("AppToken ontbreekt (zet UNTILL_APP_TOKEN in Netlify)");
  const token = appNaam ? `${appToken}:${appNaam}` : appToken;
  return {
    async get(pad, query = {}, v = "v1") {
      const q = Object.entries(query).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => `${k}=${encodeURIComponent(x)}`).join("&");
      const url = `${base}/${v}/${encodeURIComponent(cfg.dbname)}/${pad}${q ? "?" + q : ""}`;
      const r = await f(url, { headers: { authorization: auth, apptoken: token, accept: "application/json" } });
      if (!r.ok) throw new Error(`unTill ${pad}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      return r.json();
    },
  };
}

/** Haalt de stamdata op die nodig is om id's om te zetten naar namen. Ontbrekende rechten breken de sync niet. */
export async function haalStamdata(client) {
  const veilig = async (pad, v) => { try { const x = await client.get(pad, {}, v); return Array.isArray(x) ? x : []; } catch { return []; } };
  const [artikelen, groepen, betalingen, opties, gebruikers] = await Promise.all([
    veilig("article"), veilig("group", "v2"), veilig("payment-info"), veilig("option-info"),
    (async () => { const a = await veilig("user", "v2"); return a.length ? a : veilig("user-info"); })(),
  ]);
  const naamVan = (u) => u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
  return {
    artikel: new Map([...opties.map((o) => [o.id, { id: o.id, name: o.name }]), ...artikelen.map((a) => [a.id, a])]),
    groep: new Map(groepen.map((g) => [g.id, g.name])),
    betaling: new Map(betalingen.map((b) => [b.id, b.name])),
    gebruiker: new Map(gebruikers.map((u) => [u.id, naamVan(u)])),
  };
}

/** Zet unTill-transacties om naar bonnen in het standaardformaat. Eén bon per afgeronde transactie. */
export function transactiesNaarBonnen(transacties, sd) {
  const bonnen = [];
  for (const t of Array.isArray(transacties) ? transacties : []) {
    const bills = Array.isArray(t.bills) ? t.bills : [];
    if (!bills.length) continue; // nog niet betaald
    const regels = [];
    for (const o of Array.isArray(t.orders) ? t.orders : []) {
      for (const it of Array.isArray(o.items) ? o.items : []) {
        if (it.void) continue;
        const art = sd.artikel.get(it.articleId);
        const naam = art?.name || it.text || (it.articleId ? `Artikel ${it.articleId}` : null);
        if (!naam) continue;
        const bruto = getal(it.price), btw = getal(it.vat);
        if (it.kind !== 1 && bruto === 0) continue; // gratis optie/toevoeging: geen omzet
        regels.push({
          artikel: naam,
          groep: sd.groep.get(art?.groupId) || null,
          aantal: it.decimalQuantity !== undefined && it.decimalQuantity !== null ? getal(it.decimalQuantity) : getal(it.quantity || 1),
          bedrag: r2(bruto), netto: r2(bruto - btw), btw_pct: it.vatPercent === undefined ? undefined : getal(it.vatPercent),
          korting: r2(Math.abs(getal(it.discount))),
        });
      }
    }
    if (!regels.length) continue;
    const betalingen = bills.flatMap((b) => Array.isArray(b.payments) ? b.payments : []);
    const grootste = betalingen.slice().sort((a, b) => getal(b.amount) - getal(a.amount))[0];
    const laatste = bills.map((b) => b.realDateTime || b.dateTime).filter(Boolean).sort().pop();
    bonnen.push({
      ref: `t${t.id}`,
      tijd: lokaalNaarIso(laatste || t.closeDateTime) || undefined,
      tafel: t.tableNumber !== undefined && t.tableNumber !== null ? `${t.tableNumber}${t.tablePart || ""}` : undefined,
      couverts: t.covers,
      medewerker: sd.gebruiker.get(t.userId) || undefined,
      betaalwijze: betaalSoort(sd.betaling.get(grootste?.paymentId)),
      fooi: bills.reduce((a, b) => a + getal(b.tip), 0) || undefined,
      korting: regels.reduce((a, x) => a + x.korting, 0) + Math.abs(getal(t.discountOnTotal)),
      regels,
    });
  }
  return bonnen;
}

/** Zet tijdregistraties om naar uren per medewerker per dag. Nog lopende registraties (zonder stop) worden overgeslagen. */
export function urenNaarPakket(records, sd) {
  const per = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    const datum = lokaleDatum(r.start);
    if (!datum || !r.stop || String(r.stop).startsWith("1899")) continue;
    const med = sd.gebruiker.get(r.userId) || `Medewerker ${r.userId}`;
    const k = `${datum}|${med}`;
    const x = per.get(k) || { datum, medewerker: med, gewerkt: 0, kosten: 0 };
    x.gewerkt += getal(r.scaledDuration) * 24; // 1,0 = een dag van 86.400 seconden
    x.kosten += getal(r.costs);
    per.set(k, x);
  }
  return [...per.values()].map((x) => ({ datum: x.datum, medewerker: x.medewerker, gewerkt: r2(x.gewerkt), kosten: r2(x.kosten) }));
}

/** Haalt één tijdvenster op (UTC, zoals de API verwacht) en geeft een pakket in het standaardformaat. */
export async function haalPakket(client, sd, van, tot) {
  const [transacties, uren] = await Promise.all([
    client.get("turnover-transaction", { from: van, till: tot, paidOnly: true }),
    client.get("time-attendance-record", { from: van, till: tot }).catch(() => []), // uren zijn optioneel
  ]);
  return { bonnen: transactiesNaarBonnen(transacties, sd), uren: urenNaarPakket(uren, sd) };
}
