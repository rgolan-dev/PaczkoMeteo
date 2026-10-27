import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outfitAdvice, parseForecast, upcomingHours, weatherCondition, type Forecast } from '../src/lib/forecast.ts';
import { getForecast } from '../src/lib/server/forecast.ts';

const now = Date.parse('2026-10-27T07:30:00Z');
function fixture(): Forecast {
  const hours = Array.from({ length: 48 }, (_, i) => ({ time: now / 1000 - 1800 + i * 3600, temperature: 14, apparent: 12, rainChance: 0, precipitation: 0, wind: 5, gusts: 10, code: 3, isDay: 1 }));
  return { fetchedAt: new Date(now).toISOString(), current: hours[0], hours, days: [] };
}

test('outfit uses the coldest feels-like temperature in the upcoming 12 hours, excluding earlier and later hours', () => {
  const f = fixture();
  f.hours[0].apparent = 18;
  f.hours[10].apparent = -2;
  f.hours[12].apparent = -20;
  assert.equal(upcomingHours(f, now).length, 12);
  const advice = outfitAdvice(f, now)!;
  assert.equal(advice.min, -2);
  assert.equal(advice.max, 18);
  assert.equal(advice.title, 'Ciepła kurtka i dodatki');
  assert.ok(advice.tips.some(t => t.text.includes('warstwowo')));
});

test('outfit distinguishes rain, snow, freezing precipitation and wind; zero chance is valid', () => {
  const f = fixture();
  assert.ok(outfitAdvice(f, now));
  assert.ok(!outfitAdvice(f, now)!.tips.some(t => t.icon === 'rain'));
  f.hours[3].rainChance = 60;
  assert.ok(outfitAdvice(f, now)!.tips.some(t => t.text.includes('parasol')));
  f.hours[3].gusts = 45;
  assert.ok(outfitAdvice(f, now)!.tips.some(t => t.text.includes('kapturem')));
  assert.ok(outfitAdvice(f, now)!.tips.some(t => t.icon === 'wind'));
  f.hours[3].code = 73;
  assert.ok(outfitAdvice(f, now)!.tips.some(t => t.text.includes('śnieg')));
  f.hours[3].code = 66;
  assert.ok(outfitAdvice(f, now)!.tips.some(t => t.text.includes('przyczepnością')));
});

test('stale, missing and discontinuous forecasts never generate an outfit', () => {
  assert.equal(outfitAdvice(null, now), null);
  const f = fixture();
  assert.equal(outfitAdvice(f, now + 91 * 60_000), null);
  f.hours[2].apparent = null as unknown as number;
  assert.equal(outfitAdvice(f, now), null);
  const gap = fixture();
  gap.hours.splice(3, 1);
  assert.equal(outfitAdvice(gap, now), null);
  assert.equal(outfitAdvice({ ...fixture(), hours: fixture().hours.slice(0, 3) }, now), null);
});

test('forecast parser preserves zero, rejects null/numeric strings and handles UTC timestamps', () => {
  const f = parseForecast({ current: { time: now / 1000, apparent_temperature: null }, hourly: {
    time: [now / 1000, now / 1000 + 3600], temperature_2m: [0, -2], apparent_temperature: [null, '0'],
    precipitation_probability: [0, 150], wind_speed_10m: [0, -1], precipitation: [0, null]
  } }, new Date(now).toISOString());
  assert.equal(f.hours[0].temperature, 0);
  assert.equal(f.hours[0].rainChance, 0);
  assert.equal(f.hours[0].wind, 0);
  assert.equal(f.hours[0].apparent, null);
  assert.equal(f.hours[1].apparent, null);
  assert.equal(f.hours[1].rainChance, null);
  assert.equal(f.hours[1].wind, null);
  assert.equal(f.hours[1].time, now / 1000 + 3600);
  assert.throws(() => parseForecast({ hourly: { time: [1], temperature_2m: [null] } }, 'now'));
  assert.equal(weatherCondition(0, 0).icon, 'moon');
  assert.equal(weatherCondition(73).icon, 'snow');
});

test('forecast backend uses a fixed provider, km/h and unix time; shares requests and caches successes', async context => {
  const mocked = context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.open-meteo.com');
    assert.equal(url.searchParams.get('timeformat'), 'unixtime');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
    assert.equal(url.searchParams.get('latitude'), '53.123');
    return Response.json({ hourly: { time: [now / 1000], temperature_2m: [0] } });
  });
  const [first, second] = await Promise.all([getForecast(53.1231, 18.1231), getForecast(53.1231, 18.1231)]);
  assert.deepEqual(first, second);
  await getForecast(53.1231, 18.1231);
  assert.equal(mocked.mock.calls.length, 1);
});
