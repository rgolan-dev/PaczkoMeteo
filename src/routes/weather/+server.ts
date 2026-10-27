import { json } from '@sveltejs/kit';
import { getWeather, StationError } from '#lib/server/inpost.ts';
import { DEFAULT_RADIUS, MAX_SENSOR_AGE_MS, oldestMeasurementTime } from '#lib/weather.ts';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 30 };

export const GET: RequestHandler = async ({ url }) => {
  const code = (url.searchParams.get('station') ?? 'TOR75M').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(code)) return json({ message: 'Wpisz poprawny kod paczkomatu, np. TOR75M.' }, { status: 400 });
  const radius = Number(url.searchParams.get('radius') ?? DEFAULT_RADIUS);
  if (![0, 1000, 3000, 5000].includes(radius)) return json({ message: 'Wybierz promień 1, 3 lub 5 km.' }, { status: 400 });
  try {
    const data = await getWeather(code, radius);
    const oldest = oldestMeasurementTime(data);
    const ttl = oldest === null ? 0 : Math.max(0, Math.min(300, Math.floor((oldest + MAX_SENSOR_AGE_MS - Date.now()) / 1000)));
    return json(data, { headers: { 'Cache-Control': data.sensors.status === 'available' ? `public, max-age=${Math.min(60, ttl)}, s-maxage=${ttl}` : 'no-store' } });
  } catch (error) {
    return json({ message: error instanceof StationError ? error.message : 'Nie udało się połączyć z InPost. Spróbuj ponownie.' }, { status: error instanceof StationError ? error.status : 502 });
  }
};
