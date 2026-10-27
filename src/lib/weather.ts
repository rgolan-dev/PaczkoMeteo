export type Station = {
  code: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  url: string;
};

export type Sensors = {
  status: 'available' | 'unavailable' | 'blocked';
  level: string | null;
  values: Record<string, number>;
  retrievedAt: string | null;
  message: string;
  httpStatus?: number;
};

export type WeatherData = {
  station: Station;
  sensors: Sensors;
  fetchedAt: string;
  nearby?: NearbyReading[];
  aggregation?: {
    radius: number;
    readings: Record<string, AggregatedReading>;
    discoveryError: string | null;
  };
};

export type NearbyReading = { station: Station; distance: number; sensors: Sensors; directoryLevel?: string | null };
export type AggregatedReading = {
  value: number;
  min: number;
  max: number;
  sources: { code: string; distance: number; value: number }[];
};

export function aggregateReadings(points: NearbyReading[]): Record<string, AggregatedReading> {
  const groups: Record<string, AggregatedReading['sources']> = {};
  for (const point of points) {
    if (point.sensors.status !== 'available') continue;
    for (const [key, value] of Object.entries(point.sensors.values)) {
      if (!Number.isFinite(value)) continue;
      (groups[key] ??= []).push({ code: point.station.code, distance: point.distance, value });
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([key, sources]) => {
    const sorted = sources.map(source => source.value).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return [key, { value, min: sorted[0], max: sorted.at(-1)!, sources }];
  }));
}

export function distanceLabel(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${number(metres / 1000, 1)} km`;
}

export const DEFAULT_STATION: Station = {
  code: 'TOR75M', city: 'Toruń', address: 'Okólna 141',
  latitude: 52.99717, longitude: 18.63305,
  url: 'https://inpost.pl/paczkomat-torun-tor75m-okolna-paczkomaty-kujawsko-pomorskie'
};

export const LEVELS: Record<string, { label: string; color: string }> = {
  VERY_GOOD: { label: 'Bardzo dobra', color: '#46795b' },
  GOOD: { label: 'Dobra', color: '#648443' },
  MODERATE: { label: 'Umiarkowana', color: '#9a741d' },
  SUFFICIENT: { label: 'Dostateczna', color: '#b7682a' },
  BAD: { label: 'Zła', color: '#b04d40' },
  VERY_BAD: { label: 'Bardzo zła', color: '#85496c' }
};

// Missing readings must stay missing. In particular, Number('') would invent a zero.
export function parseSensors(raw: unknown, retrievedAt: string): Sensors {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid sensor response');
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.air_sensors)) throw new Error('Missing sensor readings');
  const values: Record<string, number> = {};
  const known = new Set(['TEMPERATURE', 'HUMIDITY', 'PRESSURE', 'PM1', 'PM25', 'PM4', 'PM10', 'O3', 'NO2']);
  for (const item of data.air_sensors) {
    if (typeof item !== 'string') continue;
    const [name, reading] = item.split(':');
    if (!known.has(name) || !reading?.trim()) continue;
    const number = Number(reading);
    if (!Number.isFinite(number)) continue;
    if (name !== 'TEMPERATURE' && number < 0) continue;
    if (name === 'HUMIDITY' && number > 100) continue;
    values[name] = number;
  }
  const available = Object.keys(values).length > 0;
  return {
    status: available ? 'available' : 'unavailable',
    level: available && typeof data.air_index_level === 'string' && data.air_index_level in LEVELS ? data.air_index_level : null,
    values, retrievedAt: available ? retrievedAt : null,
    message: available ? 'Odczyty udostępnione przez InPost. Źródło nie podaje czasu pomiaru.' : 'Ten paczkomat nie udostępnia obecnie odczytów czujników.'
  };
}

export function number(value: number | null | undefined, digits = 0): string {
  return value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('pl-PL', { maximumFractionDigits: digits }).format(value);
}

export function time(value: number | string): string {
  return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }).format(new Date(typeof value === 'number' ? value * 1000 : value));
}

