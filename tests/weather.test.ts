import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSensors, number, aggregateReadings, filterStaleSensors, oldestMeasurementTime, DEFAULT_STATION } from '../src/lib/weather.ts';

const payload = (values: unknown[], level: unknown = 'GOOD') => ({ current: { values, index: { name: 'PIJP', level }, fromDateTime: '2026-10-27T12:00:00Z', tillDateTime: '2026-10-27T13:15:00Z' } });

test('reads the Points API format, including zero and negative temperature', () => {
  const result = parseSensors(payload([{ name: 'PM25', value: 0 }, { name: 'TEMPERATURE', value: -3.25 }, { name: 'HUMIDITY', value: 75 }, { name: 'PRESSURE', value: 1012.5 }]), '2026-10-27T13:20:00Z');
  assert.equal(result.status, 'available');
  assert.equal(result.level, 'GOOD');
  assert.deepEqual(result.values, { PM25: 0, TEMPERATURE: -3.25, HUMIDITY: 75, PRESSURE: 1012.5 });
  assert.equal(result.measuredFrom, '2026-10-27T12:00:00Z');
  assert.equal(result.measuredTo, '2026-10-27T13:15:00Z');
});

test('does not coerce missing, boolean, string or invalid values to measurements', () => {
  const result = parseSensors(payload([{ name: 'PM25', value: null }, { name: 'PM10', value: '' }, { name: 'O3', value: Infinity }, { name: 'NO2', value: -2 }, { name: 'HUMIDITY', value: 101 }, { name: 'TEMPERATURE', value: false }, { name: 'PRESSURE', value: '1010' }, { name: 'UNKNOWN', value: 12 }, null]), 'now');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.level, null);
  assert.equal(result.retrievedAt, null);
  assert.deepEqual(result.values, {});
});

test('rejects error objects and the deprecated website response shape', () => {
  for (const raw of [null, { message: 'Access denied' }, { current: {} }, { air_sensors: ['PM25:10:'] }]) assert.throws(() => parseSensors(raw, 'now'));
});

test('keeps unknown or missing air quality unknown', () => {
  for (const level of ['NEW_LEVEL', 'toString', null]) {
    const result = parseSensors(payload([{ name: 'TEMPERATURE', value: 12.1 }], level), 'now');
    assert.equal(result.status, 'available');
    assert.equal(result.level, null);
  }
});

test('does not invent a measurement window when dates are invalid', () => {
  const raw = payload([{ name: 'PM25', value: 10 }]);
  raw.current.fromDateTime = '2026-10-27T14:00:00Z';
  const result = parseSensors(raw, 'now');
  assert.equal(result.measuredFrom, null);
  assert.equal(result.measuredTo, null);
  raw.current.fromDateTime = 'invalid';
  raw.current.tillDateTime = 'invalid';
  assert.equal(parseSensors(raw, 'now').measuredTo, null);
});

test('formats missing values without inventing zero', () => {
  assert.equal(number(null), '—');
  assert.equal(number(0), '0');
});

test('aggregates each parameter separately and ignores unavailable sources', () => {
  const point = (code: string, values: Record<string, number>, available = true) => ({ station: { ...DEFAULT_STATION, code }, distance: 100, sensors: { status: available ? 'available' as const : 'blocked' as const, level: null, values, retrievedAt: null, message: '' } });
  const result = aggregateReadings([point('TOR01M', { TEMPERATURE: 10, PM25: 0 }), point('TOR02M', { TEMPERATURE: 12 }), point('TOR03M', { TEMPERATURE: 100, PM25: 20 }), point('TOR04M', { TEMPERATURE: 999, PM25: 999 }, false)]);
  assert.equal(result.TEMPERATURE.value, 12);
  assert.equal(result.TEMPERATURE.sources.length, 3);
  assert.equal(result.PM25.value, 10);
  assert.equal(result.PM25.sources.length, 2);
  assert.equal(result.PM25.min, 0);
  assert.equal(result.PM25.max, 20);
  assert.equal(result.HUMIDITY, undefined);
  assert.deepEqual(aggregateReadings([]), {});
});


test('uses measurement time rather than fetch time to reject old, missing and future-dated readings', () => {
  const now = Date.parse('2026-10-27T14:32:00Z');
  const sensor = parseSensors(payload([{ name: 'TEMPERATURE', value: -2 }, { name: 'PM25', value: 0 }]), new Date(now).toISOString());
  const fresh = { ...sensor, measuredTo: new Date(now - 2 * 60_000).toISOString() };
  assert.equal(filterStaleSensors(fresh, now).status, 'available');
  assert.equal(filterStaleSensors(fresh, now).values.PM25, 0);
  for (const measuredTo of ['2026-10-07T08:56:18Z', new Date(now - 21 * 60_000).toISOString(), null, 'invalid', new Date(now + 10 * 60_000).toISOString()]) {
    const result = filterStaleSensors({ ...sensor, measuredTo }, now);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.values, {});
    assert.equal(result.level, null);
  }
});

test('freshness of an aggregate follows its oldest included measurement and ignores excluded points', () => {
  const now = Date.parse('2026-10-27T14:32:00Z');
  const sensor = parseSensors(payload([{ name: 'TEMPERATURE', value: 10 }]), new Date(now).toISOString());
  const old = filterStaleSensors({ ...sensor, measuredTo: '2026-10-07T08:56:18Z' }, now);
  const fresh = { ...sensor, measuredTo: new Date(now - 60_000).toISOString() };
  const olderFresh = { ...sensor, measuredTo: new Date(now - 3 * 60_000).toISOString() };
  assert.equal(oldestMeasurementTime({ station: DEFAULT_STATION, sensors: fresh, fetchedAt: new Date(now).toISOString(), nearby: [old, fresh, olderFresh].map(sensors => ({ station: DEFAULT_STATION, sensors, distance: 100 })) }), now - 3 * 60_000);
});
