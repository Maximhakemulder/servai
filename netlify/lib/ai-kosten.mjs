// SERVAI · AI-kosten bijhouden en bewaken. Prijzen zijn een SCHATTING (dollar per miljoen tokens); controleer ze op anthropic.com/pricing
// en pas aan met AI_PRIJZEN_JSON, bijvoorbeeld {"claude-haiku-5-5":[1,5]}. Wisselkoers: AI_USD_EUR (standaard 0,92).
const STANDAARD = { "claude-haiku-5-5": [1, 5], "claude-sonnet-5-5": [3, 15], "claude-opus-5-5": [5, 25] };
const prijzen = () => { try { return { ...STANDAARD, ...JSON.parse(process.env.AI_PRIJZEN_JSON || "{}") }; } catch { return STANDAARD; } };
export const kostenEur = (model, tin, tuit) => {
  const [pi, po] = prijzen()[model] || prijzen()["claude-sonnet-5-5"];          // onbekend model: reken voorzichtig met Sonnet-prijs
  return ((tin * pi + tuit * po) / 1e6) * (Number(process.env.AI_USD_EUR) || 0.92);
};
export const registreer = (rest, { klant_id, locatie_id = null, soort, model }, usage) => {
  const tin = (usage && usage.input_tokens) || 0, tuit = (usage && usage.output_tokens) || 0;
  return rest("ai_gebruik", { method: "POST", body: JSON.stringify({ klant_id, locatie_id, soort, model, tokens_in: tin, tokens_uit: tuit, kosten_eur: Math.round(kostenEur(model, tin, tuit) * 1e5) / 1e5 }) });
};
/** Kosten van deze maand voor een klant, voor het maandbudget. */
export const maandKosten = async (get, klant_id) => {
  const van = new Date(); van.setUTCDate(1); van.setUTCHours(0, 0, 0, 0);
  const rijen = await get(`ai_gebruik?klant_id=eq.${klant_id}&gemaakt=gte.${van.toISOString()}&select=kosten_eur&limit=5000`);
  return rijen.reduce((s, r) => s + Number(r.kosten_eur || 0), 0);
};
export const MAAND_BUDGET = () => Number(process.env.AI_MAANDBUDGET_EUR) || 5;   // standaardcap per klant per maand
export const MAAND_MAX = () => Number(process.env.AI_MAANDMAX_EUR) || 50;        // harde bovengrens, ook als de klant een hogere cap invult
/** De cap die nu geldt: de eigen cap van de klant (0 = AI uit), anders de standaard; nooit boven de harde bovengrens. */
export const effectieveCap = async (get, klant_id) => {
  const r = await get(`ai_instellingen?klant_id=eq.${klant_id}&select=maand_cap_eur`);
  const c = r[0] && r[0].maand_cap_eur !== null && r[0].maand_cap_eur !== undefined ? Number(r[0].maand_cap_eur) : MAAND_BUDGET();
  return Math.min(c, MAAND_MAX());
};
/** True als er deze maand nog ruimte is. */
export const ruimte = async (get, klant_id) => (await maandKosten(get, klant_id)) < (await effectieveCap(get, klant_id));
