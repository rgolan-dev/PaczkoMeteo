import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSensors, number } from '../src/lib/weather.ts';

test('preserves zero, negative temperature and supplied air quality', () => {
  const result = parseSensors({ air_index_level: 'GOOD', air_sensors: ['PM25:0:0', 'TEMPERATURE:-3.25:', 'HUMIDITY:75:', 'PRESSURE:1012.5:'] }, '2026-10-27T12:00:00Z');
  assert.equal(result.status, 'available');
  assert.equal(result.level, 'GOOD');
  assert.deepEqual(result.values, { PM25: 0, TEMPERATURE: -3.25, HUMIDITY: 75, PRESSURE: 1012.5 });
});

test('does not turn missing, nonfinite or invalid readings into measurements', () => {
  const result = parseSensors({ air_index_level: 'VERY_GOOD', air_sensors: ['PM25::', 'PM10:NaN:', 'O3:Infinity:', 'NO2:-2:', 'HUMIDITY:101:', 'UNKNOWN:12:'] }, 'now');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.level, null);
  assert.equal(result.retrievedAt, null);
  assert.deepEqual(result.values, {});
});

test('rejects an upstream error object instead of claiming clean air', () => {
  assert.throws(() => parseSensors({ message: 'Access denied' }, 'now'));
  assert.throws(() => parseSensors(null, 'now'));
});

test('keeps unknown air quality unknown even with weather readings', () => {
  const result = parseSensors({ air_index_level: 'NEW_LEVEL', air_sensors: ['TEMPERATURE:12.1:'] }, 'now');
  assert.equal(result.status, 'available');
  assert.equal(result.level, null);
});

test('formats missing values without inventing zero', () => {
  assert.equal(number(null), '—');
  assert.equal(number(0), '0');
});

test('aggregates each sensor separately, keeps zero and ignores unavailable points', async () => {
  const { aggregateReadings, DEFAULT_STATION } = await import('../src/lib/weather.ts');
  const point = (code: string, values: Record<string, number>, available = true) => ({ station: { ...DEFAULT_STATION, code }, distance: 100, sensors: { status: available ? 'available' as const : 'blocked' as const, level: null, values, retrievedAt: null, message: '' } });
  const result = aggregateReadings([
    point('TOR01M', { TEMPERATURE: 10, PM25: 0 }),
    point('TOR02M', { TEMPERATURE: 12 }),
    point('TOR03M', { TEMPERATURE: 100, PM25: 20 }),
    point('TOR04M', { TEMPERATURE: 999, PM25: 999 }, false)
  ]);
  assert.equal(result.TEMPERATURE.value, 12);
  assert.equal(result.TEMPERATURE.sources.length, 3);
  assert.equal(result.PM25.value, 10);
  assert.equal(result.PM25.sources.length, 2);
  assert.equal(result.PM25.min, 0);
  assert.equal(result.PM25.max, 20);
  assert.equal(result.HUMIDITY, undefined);
  assert.deepEqual(aggregateReadings([]), {});
});
