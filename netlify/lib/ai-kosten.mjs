// SERVAI · AI-kosten bijhouden en bewaken. Prijzen zijn een SCHATTING (dollar per miljoen tokens); controleer ze op anthropic.com/pricing
// en pas aan met AI_PRIJZEN_JSON, bijvoorbeeld {"claude-haiku-5-5":[1,5]}. Wisselkoers: AI_USD_EUR (standaard 0,92).
const STANDAARD = { "claude-haiku-5-5": [1, 5], "claude-sonnet-5-5": [3, 15], "claude-opus-5-5": [5, 25] };
const prijzen = () => { try { return { ...STANDAARD, ...JSON.parse(process.env.AI_PRIJZEN_JSON || "{}") }; } catch { return STANDAARD; } };
export const kostenEur = (model, tin, tuit) => {
  const [pi, po] = prijzen()[model] || prijzen()["claude-sonnet-5-5"];          // onbekend model: reken voorzichtig met Sonnet-prijs
  return ((tin * pi + tuit * po) / 1e6) * (Number(process.env.AI_USD_EUR) || 0.92);
};
export const registreer = (rest, { klant_id, soort, model }, usage) => {
  const tin = (usage && usage.input_tokens) || 0, tuit = (usage && usage.output_tokens) || 0;
  return rest("ai_gebruik", { method: "POST", body: JSON.stringify({ klant_id, soort, model, tokens_in: tin, tokens_uit: tuit, kosten_eur: Math.round(kostenEur(model, tin, tuit) * 1e5) / 1e5 }) });
};
/** Kosten van deze maand voor een klant, voor het maandbudget. */
export const maandKosten = async (get, klant_id) => {
  const van = new Date(); van.setUTCDate(1); van.setUTCHours(0, 0, 0, 0);
  const rijen = await get(`ai_gebruik?klant_id=eq.${klant_id}&gemaakt=gte.${van.toISOString()}&select=kosten_eur&limit=5000`);
  return rijen.reduce((s, r) => s + Number(r.kosten_eur || 0), 0);
};
export const MAAND_BUDGET = () => Number(process.env.AI_MAANDBUDGET_EUR) || 5;   // per klant per maand; daarboven pauzeert AI tot de volgende maand
