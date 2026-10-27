import { DEFAULT_STATION, aggregateReadings, parseSensors, type Sensors, type Station, type WeatherData, type NearbyReading } from '#lib/weather.ts';

export class StationError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

const cache = new Map<string, { expires: number; data: WeatherData }>();
const pending = new Map<string, Promise<WeatherData>>();
const slug = (text: string) => text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pointsApi = 'https://api-shipx-pl.easypack24.net/v1/points';
const signalFor = (deadline: AbortSignal) => AbortSignal.any([deadline, AbortSignal.timeout(5000)]);

type Point = { name: string; distance?: number; location: { latitude: number; longitude: number }; address?: { line1?: string }; address_details?: { city?: string; street?: string; province?: string }; air_index_level?: string | null };

function stationFromPoint(point: Point): Station {
  if (!/^[A-Z0-9]{3,12}$/.test(point.name) || !Number.isFinite(point.location?.latitude) || !Number.isFinite(point.location?.longitude)) throw new StationError('Nieprawidłowa lokalizacja paczkomatu.');
  const details = point.address_details ?? {};
  return {
    code: point.name, city: details.city ?? '', address: point.address?.line1 ?? '',
    latitude: point.location.latitude, longitude: point.location.longitude,
    url: point.name === DEFAULT_STATION.code ? DEFAULT_STATION.url : `https://inpost.pl/paczkomat-${slug(details.city ?? '')}-${point.name.toLowerCase()}-${slug(details.street ?? '')}-paczkomaty-${slug(details.province ?? '')}`
  };
}

async function getStation(code: string, deadline: AbortSignal): Promise<Station> {
  if (code === DEFAULT_STATION.code) return DEFAULT_STATION;
  const response = await fetch(`${pointsApi}/${encodeURIComponent(code)}`, { signal: signalFor(deadline) });
  if (response.status === 404) throw new StationError('Nie znaleziono paczkomatu. Sprawdź kod.', 404);
  if (!response.ok) throw new StationError('Nie udało się sprawdzić paczkomatu w InPost.');
  return stationFromPoint(await response.json());
}

async function getNearby(station: Station, radius: number, deadline: AbortSignal): Promise<{ station: Station; distance: number; directoryLevel?: string | null }[]> {
  const query = new URLSearchParams({ relative_point: `${station.latitude},${station.longitude}`, max_distance: String(radius), limit: '8', per_page: '8', type: 'parcel_locker_only', sort_by: 'distance_to_relative_point' });
  const response = await fetch(`${pointsApi}?${query}`, { signal: signalFor(deadline) });
  if (!response.ok) throw new Error('Nie udało się pobrać listy paczkomatów w okolicy.');
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error('Nieprawidłowa lista paczkomatów.');
  const points = new Map<string, { station: Station; distance: number; directoryLevel?: string | null }>();
  points.set(station.code, { station, distance: 0 });
  for (const item of data.items as Point[]) {
    if (!Number.isFinite(item.distance) || item.distance! < 0 || item.distance! > radius) continue;
    try { points.set(item.name, { station: stationFromPoint(item), distance: item.distance!, directoryLevel: item.air_index_level }); } catch { /* Ignore malformed points. */ }
  }
  return [...points.values()].sort((a, b) => a.distance - b.distance).slice(0, 8);
}

type ReaderResult = { code: string; httpStatus: number | null; stage: string; payload?: unknown; retrievedAt?: string };

function sensorResult(result: ReaderResult): Sensors {
  const unavailable: Sensors = { status: 'unavailable', level: null, values: {}, retrievedAt: null, message: 'Nie udało się połączyć z InPost.' };
  const httpStatus = result.httpStatus ?? undefined;
  if (httpStatus === 403 || httpStatus === 429) return { ...unavailable, status: 'blocked', httpStatus, message: `InPost odrzucił dostęp (HTTP ${httpStatus}).` };
  if (httpStatus === 404) return { ...unavailable, httpStatus, message: 'InPost nie udostępnia obecnie pomiarów tego punktu.' };
  if (result.stage === 'missing-page') return { ...unavailable, message: 'Brak interfejsu pomiarów dla tego punktu.' };
  if (httpStatus === 200 && result.payload) {
    try { return parseSensors(result.payload, result.retrievedAt ?? new Date().toISOString()); } catch { /* Invalid upstream data remains unavailable. */ }
  }
  return { ...unavailable, httpStatus };
}

async function getSensors(points: Station[], collectorUrl: URL, deadline: AbortSignal): Promise<Map<string, Sensors>> {
  const response = await fetch(collectorUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: points.map(({ code, url }) => ({ code, url })) }),
    signal: deadline,
  });
  if (!response.ok) throw new StationError(`Odczyt InPost jest niedostępny (HTTP ${response.status}).`);
  const body = await response.json();
  if (!Array.isArray(body.results)) throw new StationError('Nieprawidłowa odpowiedź odczytu InPost.');
  return new Map(points.map(point => {
    const result = body.results.find((result: ReaderResult) => result.code === point.code);
    return [point.code, sensorResult(result ?? { code: point.code, httpStatus: null, stage: 'network' })];
  }));
}

export async function getWeather(code: string, radius: number, collectorUrl: URL): Promise<WeatherData> {
  const key = `${collectorUrl.origin}:${code}:${radius}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    const deadline = AbortSignal.timeout(24_000);
    const station = await getStation(code, deadline);
    let discoveryError: string | null = null;
    let points: { station: Station; distance: number; directoryLevel?: string | null }[] = [{ station, distance: 0 }];
    if (radius) {
      try { points = await getNearby(station, radius, deadline); }
      catch { discoveryError = 'Nie udało się pobrać listy punktów w okolicy. Sprawdzono tylko wybrany paczkomat.'; }
    }
    const results = await getSensors(points.map(point => point.station), collectorUrl, deadline);
    const nearby: NearbyReading[] = points.map(point => ({ ...point, sensors: results.get(point.station.code)! }));
    const fetchedAt = new Date().toISOString();
    let sensors = nearby[0].sensors;
    const readings = aggregateReadings(nearby);
    if (radius) {
      const available = Object.keys(readings).length > 0;
      sensors = {
        status: available ? 'available' : nearby.some(point => point.sensors.status === 'blocked') ? 'blocked' : 'unavailable',
        values: Object.fromEntries(Object.entries(readings).map(([key, reading]) => [key, reading.value])),
        level: null, retrievedAt: available ? fetchedAt : null,
        message: available ? 'Mediana dostępnych pomiarów InPost.' : 'Nie uzyskano pomiarów ze sprawdzonych punktów.',
      };
    }
    const data: WeatherData = { station, sensors, fetchedAt, nearby, ...(radius ? { aggregation: { radius, readings, discoveryError } } : {}) };
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + (sensors.status === 'available' ? 300_000 : 30_000) });
    return data;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
