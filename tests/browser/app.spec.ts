import { test, expect } from '@playwright/test';
import { DEFAULT_STATION, type WeatherData } from '../../src/lib/weather.ts';

function fixture(code = 'TOR75M', available = true): WeatherData {
  const fetchedAt = new Date().toISOString();
  return {
    station: { ...DEFAULT_STATION, code, city: code === 'TOR75M' ? 'Toruń' : 'Warszawa' },
    fetchedAt,
    sensors: available
      ? { status: 'available', level: 'GOOD', values: { TEMPERATURE: 10.2, PM25: 0, PM10: 12.5, HUMIDITY: 70, PRESSURE: 1010 }, retrievedAt: fetchedAt, message: 'Odczyty InPost.' }
      : { status: 'blocked', level: null, values: {}, retrievedAt: null, httpStatus: 403, message: 'InPost odrzucił pobranie pomiarów (HTTP 403).' }
  };
}

test('shows only InPost measurements in the compact interface', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/weather?*', route => route.fulfill({ json: fixture() }));
  await page.goto('/');
  await expect(page.locator('.temperature')).toContainText('10,2');
  await expect(page.locator('.weather-metrics')).toContainText('70');
  await expect(page.getByText('Dobra', { exact: true })).toBeVisible();
  await expect(page.locator('.pollutants')).toContainText('12,5');
  await expect(page.locator('body')).not.toContainText('Open-Meteo');
  await expect(page.locator('body')).not.toContainText('MAŁA STACJA');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'O danych', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dane InPost' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Zainstaluj aplikację' }).click();
  await expect(page.getByText('iPhone · Safari', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `test-results/${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('shows one honest error without empty measurement grids', async ({ page }, testInfo) => {
  await page.route('**/weather?*', route => route.fulfill({ json: fixture('TOR75M', false) }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nie udało się pobrać pomiarów' })).toBeVisible();
  await expect(page.getByText('InPost odrzucił pobranie pomiarów (HTTP 403).', { exact: true })).toBeVisible();
  await expect(page.locator('.pollutants')).toHaveCount(0);
  await expect(page.locator('.temperature')).toHaveCount(0);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-blocked.png`, fullPage: true });
});

test('validates station selection and remembers a changed station', async ({ page }) => {
  await page.route('**/weather?*', route => route.fulfill({ json: fixture(new URL(route.request().url()).searchParams.get('station')!) }));
  await page.goto('/');
  await expect(page.locator('.temperature')).toContainText('10,2');
  await page.locator('.station-picker').click();
  await page.getByLabel('Kod paczkomatu', { exact: true }).fill('###');
  await page.getByRole('button', { name: 'Wybierz paczkomat', exact: true }).click();
  await expect(page.getByText('Wpisz kod złożony z liter i cyfr, np. TOR75M.')).toBeVisible();
  await page.getByLabel('Kod paczkomatu', { exact: true }).fill('waw01m');
  await page.getByRole('button', { name: 'Wybierz paczkomat', exact: true }).click();
  await expect(page.locator('.station-picker')).toContainText('Warszawa');
  await page.reload();
  await expect(page.locator('.station-picker')).toContainText('WAW01M');
});

test('reloads actual saved sensor readings offline', async ({ page, context }) => {
  await page.route('**/weather?*', route => route.fulfill({ json: fixture() }));
  await page.goto('/');
  await expect(page.locator('.temperature')).toContainText('10,2');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.unroute('**/weather?*');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.temperature')).toContainText('10,2');
  await expect(page.locator('.notice')).toContainText(/offline/i);
  await expect(page.locator('.notice')).toContainText('Pobrano');
});

test('live server reports InPost availability without a model fallback', async ({ request }) => {
  const invalid = await request.get('/weather?station=..%2F');
  expect(invalid.status()).toBe(400);
  const response = await request.get('/weather?station=TOR75M&radius=0');
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.station.latitude).toBe(52.99717);
  expect(data).not.toHaveProperty('forecast');
  expect(['available', 'unavailable', 'blocked']).toContain(data.sensors.status);
  if (data.sensors.status === 'blocked') {
    expect([403, 429]).toContain(data.sensors.httpStatus);
    expect(data.sensors.values).toEqual({});
  }
});

test('Python reader rejects arbitrary URLs before making upstream requests', async ({ request }) => {
  const response = await request.post('/api/inpost', { data: { points: [{ code: 'TOR75M', url: 'https://example.com/paczkomat-tor75m-test' }] } });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toBe('Invalid InPost point list');
});

test('shows nearby aggregation per sensor and allows changing the radius', async ({ page }) => {
  const data = fixture();
  const second = fixture('TOR23M');
  second.sensors.values = { TEMPERATURE: 14.2, PM10: 16.5 };
  data.nearby = [
    { station: data.station, distance: 0, sensors: { ...data.sensors, values: { ...data.sensors.values } } },
    { station: second.station, distance: 547, sensors: second.sensors }
  ];
  data.aggregation = { radius: 3000, discoveryError: null, readings: {
    TEMPERATURE: { value: 12.2, min: 10.2, max: 14.2, sources: [{ code: 'TOR75M', distance: 0, value: 10.2 }, { code: 'TOR23M', distance: 547, value: 14.2 }] },
    PM25: { value: 0, min: 0, max: 0, sources: [{ code: 'TOR75M', distance: 0, value: 0 }] },
  } };
  data.sensors = { ...data.sensors, level: null, values: { TEMPERATURE: 12.2, PM25: 0 } };
  const radii: string[] = [];
  await page.route('**/weather?*', route => {
    const radius = new URL(route.request().url()).searchParams.get('radius')!;
    radii.push(radius);
    return route.fulfill({ json: radius === '0' ? fixture() : data });
  });
  await page.goto('/');
  await expect(page.locator('.temperature')).toContainText('12,2');
  await expect(page.locator('.aggregate-caption')).toContainText('Mediana z 2 pkt.');
  await expect(page.locator('.pollutants .reading-count').first()).toHaveText('1 pkt.');
  await page.getByText('Punkty · 2/2 z pomiarami', { exact: true }).click();
  await expect(page.getByText('Okólna 141 · 0 m', { exact: true })).toBeVisible();
  await expect(page.locator('.point-row').nth(1)).toContainText('547 m');
  await page.getByLabel('Pomiary', { exact: true }).selectOption('0');
  await expect(page.locator('.temperature')).toContainText('10,2');
  expect(radii).toEqual(['3000', '0']);
});
