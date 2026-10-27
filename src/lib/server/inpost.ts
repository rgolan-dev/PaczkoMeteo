import { DEFAULT_RADIUS, DEFAULT_STATION, aggregateReadings, parseSensors, type Sensors, type Station, type WeatherData, type NearbyReading } from '#lib/weather.ts';

export class StationError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

const cache = new Map<string, { expires: number; data: WeatherData }>();
const pending = new Map<string, Promise<WeatherData>>();
const sensorCache = new Map<string, { expires: number; data: Sensors }>();
const sensorPending = new Map<string, Promise<Sensors>>();
const MAX_SENSOR_POINTS = 32;
const DIRECTORY_PAGE_SIZE = 200;
const MAX_DIRECTORY_POINTS = 500;
const MAX_DIRECTORY_PAGES = 3;
const slug = (text: string) => text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pointsApi = 'https://api-pl-points.easypack24.net/v1/points';
const signalFor = (deadline: AbortSignal) => AbortSignal.any([deadline, AbortSignal.timeout(5000)]);

type Point = { name: string; distance?: number; location: { latitude: number; longitude: number }; address?: { line1?: string }; address_details?: { city?: string; street?: string; province?: string }; air_index_level?: string | null };
type Candidate = { station: Station; distance: number; directoryLevel?: string | null };

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

async function getNearby(station: Station, radius: number, deadline: AbortSignal): Promise<{ points: Candidate[]; warning: string | null }> {
  const points = new Map<string, Candidate>();
  points.set(station.code, { station, distance: 0 });
  let warning: string | null = null;
  for (let page = 1; page <= MAX_DIRECTORY_PAGES; page++) {
    try {
      const query = new URLSearchParams({ relative_point: `${station.latitude},${station.longitude}`, max_distance: String(radius), limit: String(MAX_DIRECTORY_POINTS), per_page: String(DIRECTORY_PAGE_SIZE), page: String(page), type: 'parcel_locker_only', sort_by: 'distance_to_relative_point' });
      const response = await fetch(`${pointsApi}?${query}`, { signal: signalFor(deadline) });
      if (!response.ok) throw new Error('Nie udało się pobrać listy paczkomatów w okolicy.');
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Nieprawidłowa lista paczkomatów.');
      for (const item of data.items as Point[]) {
        if (!item || !Number.isFinite(item.distance) || item.distance! < 0 || item.distance! > radius) continue;
        try { points.set(item.name, { station: stationFromPoint(item), distance: item.distance!, directoryLevel: item.air_index_level }); } catch { /* Ignore malformed points. */ }
      }
      if (data.count >= MAX_DIRECTORY_POINTS) warning = 'W tej okolicy jest bardzo dużo punktów. Wyniki mogą nie obejmować wszystkich czujników.';
      const totalPages = Number.isFinite(data.total_pages) ? data.total_pages : data.items.length < DIRECTORY_PAGE_SIZE ? page : page + 1;
      if (page >= totalPages) break;
      if (page === MAX_DIRECTORY_PAGES) warning = 'Lista punktów jest bardzo długa. Wyniki mogą nie obejmować wszystkich czujników.';
    } catch (error) {
      if (page === 1) throw error;
      warning = 'Nie udało się pobrać dalszej części listy punktów. Pokazujemy pomiary z odnalezionych czujników.';
      break;
    }
  }
  const sorted = [...points.values()].sort((a, b) => a.distance - b.distance);
  const advertised = sorted.filter(point => typeof point.directoryLevel === 'string' && point.directoryLevel.trim().length > 0);
  // Read the whole area's directory first; ordinary nearby lockers usually have no sensor.
  // Always probe the chosen locker, and retain a small fallback if no sensor metadata exists.
  const candidates = advertised.length ? sorted.filter(point => point.station.code === station.code || advertised.includes(point)) : sorted.slice(0, 8);
  if (candidates.length > MAX_SENSOR_POINTS) warning = 'W okolicy jest wiele czujników. Pokazujemy pomiary z 32 najbliższych sprawdzonych punktów.';
  return { points: candidates.slice(0, MAX_SENSOR_POINTS), warning };
}

export async function getSensors(station: Station, deadline: AbortSignal): Promise<Sensors> {
  const unavailable: Sensors = { status: 'unavailable', level: null, values: {}, retrievedAt: null, message: 'Nie udało się połączyć z InPost.' };
  try {
    const response = await fetch(`${pointsApi}/${encodeURIComponent(station.code)}/air-sensors`, { signal: signalFor(deadline) });
    if (response.status === 403 || response.status === 429) return { ...unavailable, status: 'blocked', httpStatus: response.status, message: `InPost odrzucił dostęp (HTTP ${response.status}).` };
    if (response.status === 404) return { ...unavailable, httpStatus: 404, message: 'InPost nie udostępnia obecnie pomiarów tego punktu.' };
    if (!response.ok) return { ...unavailable, httpStatus: response.status };
    return parseSensors(await response.json(), new Date().toISOString());
  } catch { return unavailable; }
}

async function getCachedSensors(point: Candidate, deadline: AbortSignal): Promise<Sensors> {
  const key = point.station.code;
  const cached = sensorCache.get(key);
  if (cached && cached.expires > Date.now() && !(point.directoryLevel && cached.data.httpStatus === 404)) return cached.data;
  const existing = sensorPending.get(key);
  if (existing) return existing;
  const request = getSensors(point.station, deadline).then(data => {
    if (sensorCache.size >= 500) sensorCache.delete(sensorCache.keys().next().value!);
    const ttl = data.status === 'available' ? 300_000 : data.httpStatus === 404 ? 1_800_000 : 30_000;
    sensorCache.set(key, { data, expires: Date.now() + ttl });
    return data;
  });
  sensorPending.set(key, request);
  try { return await request; } finally { sensorPending.delete(key); }
}

async function collect<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await run(items[index]); }
  }));
  return output;
}

export async function getWeather(code: string, radius = DEFAULT_RADIUS): Promise<WeatherData> {
  const key = `${code}:${radius}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    const deadline = AbortSignal.timeout(24_000);
    const station = await getStation(code, deadline);
    let discoveryError: string | null = null;
    let points: Candidate[] = [{ station, distance: 0 }];
    if (radius) {
      try { const discovered = await getNearby(station, radius, deadline); points = discovered.points; discoveryError = discovered.warning; }
      catch { discoveryError = 'Nie udało się pobrać listy punktów w okolicy. Sprawdzono tylko wybrany paczkomat.'; }
    }
    const nearby: NearbyReading[] = await collect(points, async point => ({ ...point, sensors: await getCachedSensors(point, deadline) }));
    const fetchedAt = new Date().toISOString();
    let sensors = nearby[0].sensors;
    const readings = aggregateReadings(nearby);
    if (radius) {
      const available = Object.keys(readings).length > 0;
      const windows = nearby.filter(point => point.sensors.status === 'available').map(point => point.sensors);
      const from = windows.flatMap(sensor => sensor.measuredFrom ? [sensor.measuredFrom] : []).sort((a, b) => Date.parse(a) - Date.parse(b));
      const to = windows.flatMap(sensor => sensor.measuredTo ? [sensor.measuredTo] : []).sort((a, b) => Date.parse(a) - Date.parse(b));
      sensors = {
        status: available ? 'available' : nearby.some(point => point.sensors.status === 'blocked') ? 'blocked' : 'unavailable',
        values: Object.fromEntries(Object.entries(readings).map(([key, reading]) => [key, reading.value])),
        level: null, retrievedAt: available ? fetchedAt : null, measuredFrom: from[0] ?? null, measuredTo: to.at(-1) ?? null,
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
