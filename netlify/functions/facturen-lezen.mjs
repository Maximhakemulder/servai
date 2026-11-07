// SERVAI · elke 5 minuten: start de achtergrondfunctie die nieuwe facturen uitleest (een geplande functie mag maar ±15 seconden duren, een AI-uitlezing van meerdere PDF's duurt langer).
export default async () => {
  const basis = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://servai.nl";
  try { const r = await fetch(`${basis}/.netlify/functions/facturen-lezen-background`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); console.log("facturen-lezen gestart", r.status); }
  catch (e) { console.error("facturen-lezen starten mislukt", String(e.message || e)); }
};
export const config = { schedule: "*/5 * * * *" };
