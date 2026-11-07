// SERVAI · elke nacht: start de achtergrondfunctie die marktprijzen van factuurproducten ophaalt.
export default async () => {
  const basis = process.env.URL || "https://servai.nl";
  try { const r = await fetch(`${basis}/.netlify/functions/markt-benchmark-background`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); console.log("markt-benchmark gestart", r.status); }
  catch (e) { console.error("markt-benchmark starten mislukt", String(e.message || e)); }
};
export const config = { schedule: "30 3 * * *" };
