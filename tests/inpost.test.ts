import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSensors, getWeather } from '../src/lib/server/inpost.ts';
import { DEFAULT_STATION } from '../src/lib/weather.ts';

const reading = { current: { fromDateTime: new Date(Date.now() - 75 * 60_000).toISOString(), tillDateTime: new Date().toISOString(), values: [{ name: 'TEMPERATURE', value: 14 }, { name: 'PM25', value: 8 }], index: { name: 'PIJP', level: 'GOOD' } } };

test('uses the public air-sensors GET without website scraping or credentials', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(reading), { headers: { 'Content-Type': 'application/json' } }));
  const result = await getSensors(DEFAULT_STATION, AbortSignal.timeout(1000));
  assert.equal(result.status, 'available');
  assert.equal(result.values.TEMPERATURE, 14);
  assert.equal(fetch.mock.calls[0].arguments[0], 'https://api-pl-points.easypack24.net/v1/points/TOR75M/air-sensors');
  assert.equal(fetch.mock.calls.length, 1);
  assert.equal(result.measuredTo, reading.current.tillDateTime);
});

test('distinguishes missing sensors, blocked access and invalid JSON', async context => {
  for (const status of [404, 403, 429]) {
    const mocked = context.mock.method(globalThis, 'fetch', async () => new Response('', { status }));
    const result = await getSensors(DEFAULT_STATION, AbortSignal.timeout(1000));
    assert.equal(result.status, status === 404 ? 'unavailable' : 'blocked');
    assert.equal(result.httpStatus, status);
    assert.deepEqual(result.values, {});
    mocked.mock.restore();
  }
  context.mock.method(globalThis, 'fetch', async () => new Response('<html>not readings</html>'));
  assert.equal((await getSensors(DEFAULT_STATION, AbortSignal.timeout(1000))).status, 'unavailable');
});

test('keeps available nearby measurements when the selected station has no sensor', async context => {
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('?')) return Response.json({ items: [{ name: 'TOR02BAPP', distance: 685, location: { latitude: 53.00238, longitude: 18.6276 }, address: { line1: 'Podgórska 14F' }, address_details: { city: 'Toruń', street: 'Podgórska', province: 'kujawsko-pomorskie' } }] });
    if (url.includes('/TOR75M/air-sensors')) return new Response('', { status: 404 });
    if (url.includes('/TOR02BAPP/air-sensors')) return Response.json(reading);
    throw new Error('Unexpected request');
  });
  const result = await getWeather('TOR75M', 5000);
  assert.equal(result.sensors.status, 'available');
  assert.equal(result.sensors.values.PM25, 8);
  assert.equal(result.aggregation?.readings.PM25.sources[0].code, 'TOR02BAPP');
  assert.equal(result.nearby?.[0].sensors.httpStatus, 404);
  assert.equal(result.sensors.measuredTo, reading.current.tillDateTime);
});

function point(name: string, distance: number, air_index_level: string | null = null) {
  return { name, distance, air_index_level, location: { latitude: 53, longitude: 18.6 }, address: { line1: 'Testowa 1' }, address_details: { city: 'Toruń', street: 'Testowa', province: 'kujawsko-pomorskie' } };
}
function sensorReading(temperature: number) {
  return { current: { ...reading.current, values: [{ name: 'TEMPERATURE', value: temperature }, { name: 'PM25', value: 8 }] } };
}

test('defaults to 5 km, finds sensors beyond eight ordinary lockers and shares readings between radii', async context => {
  const sensorCalls: string[] = [];
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.search) {
      assert.equal(url.searchParams.get('per_page'), '200');
      assert.equal(url.searchParams.get('limit'), '500');
      return Response.json({ items: [
        ...Array.from({ length: 10 }, (_, i) => point(`DEC${i}M`, (i + 1) * 100)),
        point('SEN01M', 2000, 'GOOD'), point('SEN02M', 4500, 'GOOD'), point('SEN01M', 2000, 'GOOD'), point('SENFAR', 6000, 'GOOD')
      ] });
    }
    if (!url.pathname.endsWith('/air-sensors')) return Response.json(point('NBR01M', 0));
    const code = url.pathname.split('/').at(-2)!;
    sensorCalls.push(code);
    if (code === 'NBR01M') return new Response('', { status: 404 });
    if (code === 'SEN01M' || code === 'SEN02M') return Response.json(sensorReading(code === 'SEN01M' ? 11 : 15));
    throw new Error(`Ordinary or out-of-radius locker must not be probed: ${code}`);
  });
  const result = await getWeather('NBR01M');
  assert.equal(result.aggregation?.radius, 5000);
  assert.equal(result.sensors.values.TEMPERATURE, 13);
  assert.deepEqual(result.aggregation?.readings.TEMPERATURE.sources.map(source => source.code), ['SEN01M', 'SEN02M']);
  assert.deepEqual(sensorCalls, ['NBR01M', 'SEN01M', 'SEN02M']);
  const narrower = await getWeather('NBR01M', 3000);
  assert.equal(narrower.sensors.values.TEMPERATURE, 11);
  assert.deepEqual(sensorCalls, ['NBR01M', 'SEN01M', 'SEN02M']);
});

test('discovers a sensor on the next directory page before selecting measurement points', async context => {
  const pages: string[] = [];
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.search) {
      const page = url.searchParams.get('page')!;
      pages.push(page);
      return Response.json({ count: 201, total_pages: 2, items: page === '1' ? [point('NOINDEX', 50)] : [point('PGS01M', 4700, 'VERY_GOOD')] });
    }
    if (!url.pathname.endsWith('/air-sensors')) return Response.json(point('NBR02M', 0));
    return url.pathname.includes('/PGS01M/') ? Response.json(sensorReading(9)) : new Response('', { status: 404 });
  });
  const result = await getWeather('NBR02M');
  assert.deepEqual(pages, ['1', '2']);
  assert.equal(result.sensors.values.TEMPERATURE, 9);
  assert.equal(result.aggregation?.readings.TEMPERATURE.sources[0].code, 'PGS01M');
});

test('retains already discovered sensors and labels incomplete discovery if a later directory page fails', async context => {
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.search) return url.searchParams.get('page') === '1'
      ? Response.json({ total_pages: 2, items: [point('PARS01M', 4000, 'GOOD')] })
      : new Response('', { status: 503 });
    if (!url.pathname.endsWith('/air-sensors')) return Response.json(point('NBR03M', 0));
    return url.pathname.includes('/PARS01M/') ? Response.json(sensorReading(7)) : new Response('', { status: 404 });
  });
  const result = await getWeather('NBR03M');
  assert.equal(result.sensors.status, 'available');
  assert.equal(result.sensors.values.TEMPERATURE, 7);
  assert.match(result.aggregation!.discoveryError!, /dalszej części/);
});

test('bounds sensor requests, keeps nearest candidates and labels the limit instead of silently truncating', async context => {
  let active = 0, maxActive = 0, calls = 0;
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.search) return Response.json({ items: Array.from({ length: 40 }, (_, i) => point(`CAP${i}M`, 100 + i * 100, 'GOOD')) });
    if (!url.pathname.endsWith('/air-sensors')) return Response.json(point('NBR04M', 0));
    calls++; active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return Response.json(sensorReading(10));
  });
  const result = await getWeather('NBR04M');
  assert.equal(calls, 32);
  assert.ok(maxActive <= 3);
  assert.equal(result.nearby?.length, 32);
  assert.equal(result.nearby?.at(-1)?.station.code, 'CAP30M');
  assert.match(result.aggregation!.discoveryError!, /32/);
});

test('excludes old, undated and future measurements before computing medians and time ranges', async context => {
  const current = Date.now();
  const raw = (end: number) => ({ current: { ...reading.current, fromDateTime: new Date(end - 75 * 60_000).toISOString(), tillDateTime: new Date(end).toISOString() } });
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.search) return Response.json({ items: ['FSH01M', 'OLD01M', 'NOTIME', 'FUT01M'].map((code, i) => point(code, 100 + i * 100, 'GOOD')) });
    if (!url.pathname.endsWith('/air-sensors')) return Response.json(point('NBR05M', 0));
    if (url.pathname.includes('/FSH01M/')) return Response.json(raw(current - 2 * 60_000));
    if (url.pathname.includes('/OLD01M/')) return Response.json(raw(current - 20 * 86400_000));
    if (url.pathname.includes('/NOTIME/')) return Response.json({ current: { values: reading.current.values } });
    if (url.pathname.includes('/FUT01M/')) return Response.json(raw(current + 86400_000));
    return new Response('', { status: 404 });
  });
  const result = await getWeather('NBR05M');
  assert.equal(result.sensors.status, 'available');
  assert.deepEqual(result.aggregation!.readings.TEMPERATURE.sources.map(p => p.code), ['FSH01M']);
  assert.equal(result.sensors.measuredTo, new Date(current - 2 * 60_000).toISOString());
  assert.equal(result.sensors.measuredFrom, new Date(current - 77 * 60_000).toISOString());
  for (const code of ['OLD01M', 'NOTIME', 'FUT01M']) {
    const sensor = result.nearby!.find(p => p.station.code === code)!.sensors;
    assert.equal(sensor.status, 'unavailable');
    assert.deepEqual(sensor.values, {});
  }
});

test('a single old sensor is unavailable even if its response was fetched now', async context => {
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => String(input).endsWith('/air-sensors')
    ? Response.json({ current: { ...reading.current, fromDateTime: '2026-10-07T07:56:18Z', tillDateTime: '2026-10-07T08:56:18Z' } })
    : Response.json(point('NBR06M', 0)));
  const result = await getWeather('NBR06M', 0);
  assert.equal(result.sensors.status, 'unavailable');
  assert.deepEqual(result.sensors.values, {});
  assert.match(result.sensors.message, /ponad 20 minut/);
});

test('aggregate cache expires when a cached sensor crosses the freshness cutoff', async context => {
  const base = Date.now();
  let clock = base, directoryCalls = 0, sensorCalls = 0;
  context.mock.method(Date, 'now', () => clock);
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.search) { directoryCalls++; return Response.json({ items: [point('EXP01M', 100, 'GOOD')] }); }
    if (!url.pathname.endsWith('/air-sensors')) return Response.json(point('NBR07M', 0));
    if (url.pathname.includes('/EXP01M/')) {
      sensorCalls++;
      return Response.json({ current: { ...reading.current, fromDateTime: new Date(base - 90 * 60_000).toISOString(), tillDateTime: new Date(base - 19 * 60_000).toISOString() } });
    }
    return new Response('', { status: 404 });
  });
  assert.equal((await getWeather('NBR07M')).sensors.status, 'available');
  clock += 2 * 60_000;
  const expired = await getWeather('NBR07M');
  assert.equal(directoryCalls, 2);
  assert.equal(sensorCalls, 1);
  assert.equal(expired.sensors.status, 'unavailable');
  assert.deepEqual(expired.sensors.values, {});
});
