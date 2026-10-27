import { json } from '@sveltejs/kit';
import { getForecast } from '#lib/server/forecast.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const lat = url.searchParams.get('lat'), lon = url.searchParams.get('lon');
  const latitude = Number(lat), longitude = Number(lon);
  if (!lat?.trim() || !lon?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return json({ message: 'Nieprawidłowa lokalizacja prognozy.' }, { status: 400 });
  try {
    return json(await getForecast(latitude, longitude), { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900' } });
  } catch {
    return json({ message: 'Prognoza jest chwilowo niedostępna. Spróbuj odświeżyć później.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};
