import { parseSensors } from '../src/lib/weather.ts';

const results = await Promise.all(['TOR75M', 'TOR02BAPP'].map(async code => {
  try {
    const response = await fetch(`https://api-pl-points.easypack24.net/v1/points/${code}/air-sensors`, { signal: AbortSignal.timeout(10000) });
    const sensors = response.ok ? parseSensors(await response.json(), new Date().toISOString()) : null;
    return { code, status: response.status, available: sensors?.status === 'available', values: sensors?.values };
  } catch (error) {
    return { code, available: false, error: error.message };
  }
}));
console.log(JSON.stringify(results));
console.log('::notice title=Public InPost Points API::' + JSON.stringify(results));
if (!results.some(result => result.available)) {
  console.error('::error::No measurements returned by the public Points API');
  process.exitCode = 1;
}
