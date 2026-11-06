// Proxy voor het dashboard: houdt de Open-Meteo-sleutel server-side. GET ?lat=..&lon=..
import { weerUrl } from "../lib/weer.mjs";
export default async (req) => {
  const u = new URL(req.url), lat = parseFloat(u.searchParams.get("lat")), lon = parseFloat(u.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon) || lat < 50 || lat > 54 || lon < 3 || lon > 8) return new Response("ongeldige locatie", { status: 400 });
  const r = await fetch(weerUrl({ lat, lon }));
  return new Response(await r.text(), { status: r.ok ? 200 : 502, headers: { "content-type": "application/json", "cache-control": "public, max-age=900" } });
};
