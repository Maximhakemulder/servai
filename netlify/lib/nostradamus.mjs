// SERVAI · Nostradamus BI-interface (alleen lezen). Rooster (planning) en gewerkte uren (hours) per kantoor/locatie.
// Elke klant heeft een eigen adres: https://<klant>.nostradamus.nu/index2.php, met een api-key van een gebruiker met de rol "Board".
const DAG = 864e5;
export const KLANT_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const dagStr = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const num = (x) => { const n = Number(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;

export function maakClient({ klant, api_key }, fetchImpl = fetch) {
  if (!KLANT_RE.test(klant || "")) throw new Error("Ongeldige klantnaam voor het Nostradamus-adres");
  return { async get(element, params = {}) {
    const q = new URLSearchParams({ option: "com_webservices", controller: "json", method: "hours.board.fetch", element, ...params });
    const r = await fetchImpl(`https://${klant}.nostradamus.nu/index2.php?${q}`, { headers: { "api-key": api_key, accept: "application/json" } });
    if (r.status === 401 || r.status === 403) throw new Error("Nostradamus weigert de api-key (geen Board-rechten of ingetrokken)");
    if (!r.ok) throw new Error(`Nostradamus ${element}: fout ${r.status}`);
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { throw new Error(`Nostradamus ${element}: geen geldige JSON (controleer de klantnaam en api-key)`); }
    if (Array.isArray(j)) return j;
    const a = j && typeof j === "object" ? Object.values(j).find(Array.isArray) : null;   // sommige installaties wikkelen de lijst in een object
    if (a) return a;
    if (j && typeof j === "object" && Object.keys(j).length && Object.values(j).every((v) => v && typeof v === "object")) return Object.values(j);
    return [];
  } };
}

export const hhmm = (t) => { const m = /(?:^|[T\s])(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };

/** Vertaalt planning-, uren- en personeelsrijen naar de rijen van SERVAI. Pure functie (getest). */
export function vertaal({ planning = [], uren = [], staff = [], office_id }, ctx) {
  const mine = (r) => office_id == null || String(r.office_id ?? r.hour_office_id) === String(office_id);
  const naam = new Map(staff.map((s) => [String(s.card_id), String(s.staff_name || s.card_name || "").trim()]));
  const open = (r) => r.card_id == null || r.card_id === "" || Number(r.card_id) === 0;
  const wie = (r) => open(r) ? "Open diensten" : naam.get(String(r.card_id)) || String(r.card_name || "").trim() || `Medewerker ${r.card_id}`;
  const rooster = [], gepl = new Map(), gew = new Map();
  for (const p of planning.filter(mine)) {
    if (!p.planning_date || !/^\d{4}-\d{2}-\d{2}/.test(p.planning_date)) continue;
    const datum = p.planning_date.slice(0, 10), med = wie(p), h = num(p.planning_hours);
    rooster.push({ ...ctx, datum, medewerker: med, begin_tijd: hhmm(p.planning_start), eind_tijd: hhmm(p.planning_end), uren: r2(h), functie: String(p.planning_workspace_name || "").trim().slice(0, 80) || null, bron: "nostradamus" });
    const k = datum + "|" + med, v = gepl.get(k) || { ...ctx, datum, medewerker: med, gepland_uren: 0, kosten: 0 };
    v.gepland_uren = r2(v.gepland_uren + h); v.kosten = r2(v.kosten + num(p.planning_costs)); gepl.set(k, v);
  }
  for (const u of uren.filter(mine)) {
    if (!u.hour_date || !/^\d{4}-\d{2}-\d{2}/.test(u.hour_date)) continue;
    const datum = u.hour_date.slice(0, 10), med = wie(u), k = datum + "|" + med;
    const v = gew.get(k) || { ...ctx, datum, medewerker: med, gewerkt_uren: 0 };
    v.gewerkt_uren = r2(v.gewerkt_uren + num(u.hour_hours)); gew.set(k, v);
  }
  return { rooster, gepland: [...gepl.values()], gewerkt: [...gew.values()] };
}

const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

export async function syncNostradamus(rest, kop, geheim, { nu = new Date(), fetchImpl } = {}) {
  const ctx = { klant_id: kop.klant_id, locatie_id: kop.locatie_id };
  const status = (v) => rest(`koppelingen?id=eq.${kop.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(v) });
  try {
    const c = maakClient(geheim, fetchImpl), t = nu.getTime();
    const van = dagStr(t - 14 * DAG), tot = dagStr(t + 28 * DAG);
    const [planning, uren, staff] = await Promise.all([
      c.get("planning", { start: van, end: tot, state: "1" }),
      c.get("hours", { start: van, end: dagStr(t) }),
      c.get("staff").catch(() => []),                                   // namen; zonder namen gebruiken we de kaartnaam of het nummer
    ]);
    const d = vertaal({ planning, uren, staff, office_id: geheim.office_id }, ctx);
    const up = async (tabel, rijen, conflict) => { for (const ch of chunks(rijen, 500)) {
      const r = await rest(`${tabel}?on_conflict=${conflict}`, { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(ch) });
      if (!r.ok) throw new Error(`Wegschrijven naar ${tabel} mislukt: ${(await r.text()).slice(0, 200)}`); } };
    // rooster: vervang onze eigen diensten in het venster (handmatig geüploade diensten blijven staan)
    const venster = `locatie_id=eq.${kop.locatie_id}&datum=gte.${dagStr(t)}&datum=lte.${tot}`;
    let metBron = true;
    let del = await rest(`rooster?${venster}&bron=eq.nostradamus`, { method: "DELETE", headers: { prefer: "return=minimal" } });
    if (!del.ok) {                                                      // oudere database zonder kolom "bron": vervang dan alle diensten in het venster
      metBron = false;
      del = await rest(`rooster?${venster}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
    }
    if (!del.ok) throw new Error("Oud rooster vervangen mislukt: " + (await del.text()).slice(0, 200));
    const toekomst = d.rooster.filter((r) => r.datum >= dagStr(t)).map((r) => { if (!metBron) delete r.bron; return r; });
    for (const ch of chunks(toekomst, 500)) { const r = await rest("rooster", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(ch) }); if (!r.ok) throw new Error("Rooster wegschrijven mislukt: " + (await r.text()).slice(0, 200)); }
    await rest(`uren?locatie_id=eq.${kop.locatie_id}&medewerker=in.("Medewerker null","Medewerker undefined","Medewerker 0")`, { method: "DELETE", headers: { prefer: "return=minimal" } });   // oude naam van open diensten uit een eerdere versie
    await up("uren", d.gepland, "locatie_id,datum,medewerker");        // alleen gepland_uren + kosten
    await up("uren", d.gewerkt, "locatie_id,datum,medewerker");        // alleen gewerkt_uren
    await status({ status: "ok", laatste_succes: nu.toISOString(), laatste_fout: null, sync_tot: nu.toISOString() });
    return { ok: true, diensten: toekomst.length, gepland: d.gepland.length, gewerkt: d.gewerkt.length };
  } catch (e) {
    const m = String(e.message || e).slice(0, 300);
    await status({ status: "fout", laatste_fout: m });
    return { ok: false, fout: m };
  }
}
