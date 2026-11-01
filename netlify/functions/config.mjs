// Geeft het dashboard de PUBLIEKE Supabase-gegevens (URL + publishable key).
// De geheime sleutel (SUPABASE_SERVICE_KEY) wordt hier bewust NIET teruggegeven.
export default async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "niet ingesteld" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ url, key }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/config" };
