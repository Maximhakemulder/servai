// Open-Meteo: met OPEN_METEO_API_KEY via de commerciële host, zonder sleutel de gratis (niet-commerciële) host.
const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunshine_duration";
export const weerUrl = ({ lat, lon, verleden = 0, dagen = 7, sleutel = process.env.OPEN_METEO_API_KEY }) => {
  const host = sleutel ? "https://customer-api.open-meteo.com" : "https://api.open-meteo.com";
  const q = new URLSearchParams({ latitude: (+lat).toFixed(4), longitude: (+lon).toFixed(4), daily: DAILY, timezone: "Europe/Amsterdam", past_days: String(verleden), forecast_days: String(dagen) });
  if (sleutel) q.set("apikey", sleutel);
  return `${host}/v1/forecast?${q}`;
};
export const parseWeer = (j) => {
  const D = j && j.daily; if (!D || !D.time) return [];
  return D.time.map((t, i) => ({
    datum: t, code: D.weather_code[i], temp_max: D.temperature_2m_max[i], temp_min: D.temperature_2m_min[i],
    neerslag_mm: D.precipitation_sum[i], regenkans: D.precipitation_probability_max ? D.precipitation_probability_max[i] : null,
    wind_max: D.wind_speed_10m_max[i], zon_uren: D.sunshine_duration && D.sunshine_duration[i] != null ? Math.round(D.sunshine_duration[i] / 360) / 10 : null,
  }));
};
export const haalWeer = async (opt) => { const r = await fetch(weerUrl(opt)); if (!r.ok) throw new Error("weer " + r.status); return parseWeer(await r.json()); };
