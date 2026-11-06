// SERVAI · AI-adviezen. De AI krijgt alleen samengevatte cijfers (geen bonregels, geen gastgegevens) en mag alleen adviseren.
const r1 = (n) => Math.round(Number(n) * 10) / 10;
const som = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
const vandaag0 = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const wd = (d) => WD[new Date(d + "T12:00:00Z").getUTCDay()];

export const THEMA_C = ["Omzet", "Personeel", "Inkoop", "Menu", "Gasten", "Reserveringen", "Kansen", "Weer"];
export const THEMA_V = ["overzicht", "financien", "loonkosten", "personeel", "rooster", "inkoop", "menu", "dranken", "facturen", "gasten", "reserveringen", "kansen", "upselling"];

/** Telt rijen per datum op (meerdere locaties van één klant worden samengevoegd). */
export const perDag = (rijen, datumKey, velden) => {
  const m = new Map();
  for (const r of rijen || []) { const d = String(r[datumKey]).slice(0, 10); const o = m.get(d) || { d }; for (const v of velden) o[v] = (o[v] || 0) + (Number(r[v]) || 0); m.set(d, o); }
  return [...m.values()].sort((a, b) => a.d.localeCompare(b.d)).map((o) => ({ ...o, wd: wd(o.d) }));
};

/** Bouwt de compacte feitenlijst voor één klant uit ruwe tabelrijen. Puur, dus te testen. */
/** Omzetaandeel per uur per weekdag (laatste weken): laat zien wanneer de omzet binnenkomt. */
export const uurProfiel = (rijen) => {
  const per = {};
  for (const r of rijen || []) { const w = wd(String(r.bedrijfsdag).slice(0, 10)); const o = (per[w] ||= { tot: 0, u: {}, dagen: new Set() }); const v = Number(r.omzet) || 0; o.tot += v; o.u[r.uur] = (o.u[r.uur] || 0) + v; o.dagen.add(String(r.bedrijfsdag).slice(0, 10)); }
  return Object.entries(per).filter(([, o]) => o.tot > 0 && o.dagen.size >= 2).map(([w, o]) => ({ wd: w, dagen: o.dagen.size, gem_omzet_per_dag: Math.round(o.tot / o.dagen.size),
    drukste_uren: Object.entries(o.u).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([uur, v]) => ({ uur: Number(uur), aandeel_pct: r1((v / o.tot) * 100) })) }));
};
/** Vergelijkt de laatste 28 dagen met de 28 dagen daarvoor per naam (groep of artikel). */
export const trendPer = (rijen, key, nu, max) => {
  const grens = new Date(Date.parse(nu + "T12:00:00Z") - 28 * 864e5).toISOString().slice(0, 10), m = new Map();
  for (const r of rijen || []) { const n = r[key]; if (!n) continue; const o = m.get(n) || { naam: n, omzet: 0, vorig: 0, aantal: 0 }; const v = Number(r.omzet) || 0; if (String(r.bedrijfsdag).slice(0, 10) >= grens) { o.omzet += v; o.aantal += Number(r.aantal) || 0; } else o.vorig += v; m.set(n, o); }
  return [...m.values()].filter((o) => o.omzet > 0 || o.vorig > 0).sort((a, b) => b.omzet - a.omzet).slice(0, max).map((o) => ({ naam: o.naam, omzet: Math.round(o.omzet), aantal: Math.round(o.aantal), vorige_28_dagen: Math.round(o.vorig), verschil_pct: o.vorig > 0 ? r1(((o.omzet - o.vorig) / o.vorig) * 100) : null }));
};

export function samenvatFeiten({ klant, zaak, omzet, loon, reserv, rooster, weer, evenementen, prijzen, gerechten, uren, groepen, artikelen }) {
  const omz = perDag(omzet, "bedrijfsdag", ["omzet", "bonnen", "couverts"]).map((o) => ({ ...o, omzet: Math.round(o.omzet) }));
  const lk = perDag(loon, "datum", ["omzet", "loonkosten", "gewerkt_uren"]).filter((o) => o.loonkosten > 0).map((o) => ({ d: o.d, wd: o.wd, omzet: Math.round(o.omzet), loonkosten: Math.round(o.loonkosten), pct: o.omzet > 0 ? r1((o.loonkosten / o.omzet) * 100) : null }));
  const res = perDag((reserv || []).map((r) => ({ d: String(r.tijdstip).slice(0, 10), personen: r.personen, aantal: 1 })), "d", ["personen", "aantal"]);
  const roo = perDag(rooster, "datum", ["uren"]).map((o) => ({ ...o, uren: r1(o.uren) }));
  const prijs = (prijzen || []).filter((p) => p.pct >= 3).sort((a, b) => b.pct - a.pct).slice(0, 12).map((p) => ({ product: p.omschrijving, leverancier: p.leverancier, van: p.vorige_prijs, naar: p.prijs, pct: p.pct, eenheid: p.eenheid }));
  const gr = (gerechten || []).filter((g) => g.kostprijs > 0 && g.verkoopprijs > 0).map((g) => ({ naam: g.naam, groep: g.groep, verkoopprijs: g.verkoopprijs, kostprijs: r1(g.kostprijs), kostprijs_pct: r1((g.kostprijs / (g.verkoopprijs / 1.09)) * 100) })).sort((a, b) => b.kostprijs_pct - a.kostprijs_pct).slice(0, 10);
  const wk = {}; for (const o of omz) { (wk[o.wd] ||= []).push(o.omzet); }
  const gemWd = Object.entries(wk).map(([w, a]) => ({ wd: w, dagen: a.length, gem_omzet: Math.round(som(a.map((x) => ({ x })), "x") / a.length), laagste: Math.min(...a), hoogste: Math.max(...a) }));
  const maandOmzet = Math.round(som(omz.slice(-28), "omzet"));
  return {
    zaak: zaak || null, omzet_laatste_28_dagen: maandOmzet, bagatelgrens_eur_per_maand: Math.max(75, Math.round(maandOmzet * 0.005)),
    gemiddelde_per_weekdag: gemWd,
    vandaag: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }),
    loonnorm_pct: Number(klant && klant.loonnorm_pct) || 30,
    omzet_laatste_dagen: omz, loonkosten_laatste_dagen: lk,
    reserveringen_komende_dagen: res, rooster_uren_komende_dagen: roo,
    weer_komende_dagen: (weer || []).map((w) => ({ d: w.datum, wd: wd(w.datum), code: w.code, max: w.temp_max, min: w.temp_min, regenkans: w.regenkans, wind: w.wind_max })),
    evenementen: (evenementen || []).map((e) => ({ d: e.datum, tot: e.tot, naam: e.naam, drukte: e.drukte })),
    omzet_per_uur_per_weekdag: uurProfiel(uren), productgroepen: trendPer(groepen, "groep", vandaag0(), 12), topartikelen: trendPer(artikelen, "artikel", vandaag0(), 15),
    prijsstijgingen_inkoop: prijs, hoogste_kostprijs_gerechten: gr,
    heeft_data: omz.length >= 7,
  };
}

/** Controleert en schoont wat de AI teruggeeft. Alles wat niet klopt wordt weggegooid. */
export function normaliseerAdvies(items, { bagatel = 0 } = {}) {
  const uit = [];
  for (const i of Array.isArray(items) ? items : []) {
    const t = ["warn", "info", "goed"].includes(i && i.t) ? i.t : null;
    const h = String((i && i.h) || "").trim().slice(0, 110), x = String((i && i.x) || "").trim().slice(0, 300);
    if (!t || !h || !x || !/\d/.test(x)) continue;                       // een advies zonder cijfers wordt niet getoond
    const c = THEMA_C.includes(i.c) ? i.c : "Omzet", v = THEMA_V.includes(i.v) ? i.v : "overzicht";
    const a = String(i.a || "").trim().slice(0, 240), m = Math.round(Math.abs(Number(i.impact_eur_maand)) || 0);
    if (t !== "goed" && m < bagatel) continue;                           // te klein om de ondernemer mee lastig te vallen
    uit.push({ t, c, h, x, ...(a ? { a } : {}), v, ...(m ? { m } : {}), ai: true });
  }
  // belangrijkste eerst: aandacht en kansen op geschatte euro's per maand
  uit.sort((p, q) => (q.m || 0) - (p.m || 0));
  return uit.slice(0, 8);
}

const SCHEMA = { type: "object", properties: { adviezen: { type: "array", maxItems: 8, items: { type: "object", required: ["t", "c", "h", "x", "a", "v", "impact_eur_maand"], properties: {
  t: { type: "string", enum: ["warn", "info", "goed"], description: "warn = aandacht, info = kans, goed = goed nieuws" },
  c: { type: "string", enum: THEMA_C }, h: { type: "string", description: "Kop, max 90 tekens" },
  x: { type: "string", description: "Onderbouwing met de concrete cijfers uit de data" },
  a: { type: "string", description: "Concrete, uitvoerbare aanbeveling met cijfers (SERVAI past zelf nooit iets aan)" },
  impact_eur_maand: { type: "number", description: "Geschatte waarde in euro per maand van dit advies (besparing, extra omzet of risico). Zet de berekening kort in x." },
  v: { type: "string", enum: THEMA_V } } } } }, required: ["adviezen"] };

const SYSTEEM = `Je bent SERVAI, de AI-adviseur van een horecaondernemer: een scherpe bedrijfsadviseur die meedenkt, geen alarmbel.
Schrijf kort, zakelijk Nederlands, zonder uitroeptekens.

Wat een goed advies is:
- Het is feitelijk, onderbouwd met concrete cijfers uit de data, en overdacht: je legt uit WAAROM het gebeurt en wat de ondernemer er concreet aan kan doen.
- Het is materieel: reken uit wat het per maand in euro's waard is en zet die berekening kort in 'x' (bijvoorbeeld "6 gerechten per dag x € 0,40 x 26 dagen = € 62 per maand"). Vul 'impact_eur_maand' in. Alles onder de bagatelgrens (bagatelgrens_eur_per_maand) laat je weg.
- Zoek verbanden tussen bronnen en combineer oorzaken: een prijsstijging telt pas mee in combinatie met hoeveel er van het product wordt verkocht; een rustige dag telt pas als rooster en reserveringen er niet bij passen; weer en evenementen verklaren soms een afwijking.
- Vergelijk dagen met dezelfde weekdag (gemiddelde_per_weekdag), nooit met gisteren. Normale schommelingen zijn geen nieuws: een dag die € 40 onder het weekdaggemiddelde ligt is ruis. Alleen een patroon over meerdere weken of een duidelijke afwijking is een advies.
- Voorwaarts kijken is waardevoller dan terugkijken: wat komt er de komende 14 dagen aan (reserveringen, weer, evenementen) en wat betekent dat voor rooster en inkoop.

Wat je niet doet:
- Geen triviale of kleine signalen (een prijsverandering van een paar cent, een kleine dagschommeling), geen algemene horecatips, geen herhaling van wat de ondernemer al ziet.
- Niets verzinnen. Gebruik uitsluitend de aangeleverde cijfers. Weinig data betekent: zeg dat in 'x' of laat het advies weg.
- SERVAI adviseert alleen. Zeg nooit dat SERVAI prijzen, roosters of bestellingen aanpast; de ondernemer beslist.
- Geen gastgegevens noemen.
- Het advies gaat over de zaak in het veld "zaak". Inkoopprijzen en menu gelden voor de hele organisatie; zeg dat erbij als een advies daarop steunt.

Kwaliteit boven kwantiteit: 3 sterke adviezen zijn beter dan 8 matige. Zijn er geen echt waardevolle adviezen, geef er dan weinig of geen. Belangrijkste eerst.`;

export async function vraagAdvies(feiten, { apiKey, model, onUsage } = {}) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || "claude-haiku-5-5", max_tokens: 3500, system: SYSTEEM,
      tools: [{ name: "adviezen", description: "De adviezen voor deze ondernemer", input_schema: SCHEMA }], tool_choice: { type: "tool", name: "adviezen" },
      messages: [{ role: "user", content: "Cijfers van deze zaak (JSON):\n" + JSON.stringify(feiten) }] }),
  });
  if (!r.ok) throw new Error(`advies mislukt (${r.status})`);
  const out = await r.json();
  if (onUsage) await onUsage(out.usage);
  const t = (out.content || []).find((c) => c.type === "tool_use");
  if (!t) throw new Error("geen advies ontvangen");
  return normaliseerAdvies(t.input && t.input.adviezen, { bagatel: feiten.bagatelgrens_eur_per_maand });
}
