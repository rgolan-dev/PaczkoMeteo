import { parseForecast, type Forecast } from '#lib/forecast.ts';

const cache = new Map<string, { expires: number; data: Forecast }>();
const pending = new Map<string, Promise<Forecast>>();

export async function getForecast(latitude: number, longitude: number): Promise<Forecast> {
  const lat = latitude.toFixed(3), lon = longitude.toFixed(3);
  const key = `${lat},${lon}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    const query = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: 'Europe/Warsaw', timeformat: 'unixtime', forecast_days: '3',
      current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset',
      wind_speed_unit: 'kmh'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Prognoza jest chwilowo niedostępna.');
    const data = parseForecast(await response.json(), new Date().toISOString());
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 15 * 60_000, data });
    return data;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
