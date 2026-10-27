import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSensors, getWeather } from '../src/lib/server/inpost.ts';
import { DEFAULT_STATION } from '../src/lib/weather.ts';

const reading = { current: { fromDateTime: '2026-10-27T12:00:00Z', tillDateTime: '2026-10-27T13:15:00Z', values: [{ name: 'TEMPERATURE', value: 14 }, { name: 'PM25', value: 8 }], index: { name: 'PIJP', level: 'GOOD' } } };

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
