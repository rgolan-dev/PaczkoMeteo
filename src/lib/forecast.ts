export type ForecastHour = {
  time: number;
  temperature: number | null;
  apparent: number | null;
  rainChance: number | null;
  precipitation: number | null;
  wind: number | null;
  gusts: number | null;
  code: number | null;
  isDay: number | null;
};
export type Forecast = {
  fetchedAt: string;
  current: ForecastHour;
  hours: ForecastHour[];
  days: { time: number; min: number | null; max: number | null; code: number | null; rainChance: number | null; sunrise: number | null; sunset: number | null }[];
};

const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const positive = (value: unknown) => { const n = numeric(value); return n !== null && n >= 0 ? n : null; };
const percent = (value: unknown) => { const n = positive(value); return n !== null && n <= 100 ? n : null; };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

export function parseForecast(raw: unknown, fetchedAt: string): Forecast {
  const root = record(raw);
  const hourly = record(root.hourly);
  const daily = record(root.daily);
  const current = record(root.current);
  const row = (source: Record<string, unknown>, index?: number): ForecastHour => {
    const get = (key: string) => index === undefined ? source[key] : Array.isArray(source[key]) ? source[key][index] : null;
    return {
      time: positive(get('time')) ?? 0, temperature: numeric(get('temperature_2m')),
      apparent: numeric(get('apparent_temperature')), rainChance: percent(get('precipitation_probability')),
      precipitation: positive(get('precipitation')), wind: positive(get('wind_speed_10m')),
      gusts: positive(get('wind_gusts_10m')), code: positive(get('weather_code')), isDay: positive(get('is_day'))
    };
  };
  const hours = (Array.isArray(hourly.time) ? hourly.time : []).map((_, i) => row(hourly, i)).filter(h => h.time > 0).sort((a, b) => a.time - b.time);
  if (!hours.some(hour => hour.temperature !== null)) throw new Error('Brak godzinowej prognozy.');
  const days = (Array.isArray(daily.time) ? daily.time : []).flatMap((time, i) => {
    if (positive(time) === null) return [];
    const get = (key: string) => Array.isArray(daily[key]) ? daily[key][i] : null;
    return [{ time: time as number, min: numeric(get('temperature_2m_min')), max: numeric(get('temperature_2m_max')), code: positive(get('weather_code')), rainChance: percent(get('precipitation_probability_max')), sunrise: positive(get('sunrise')), sunset: positive(get('sunset')) }];
  });
  return { fetchedAt, current: row(current), hours, days };
}

export function weatherCondition(code: number | null, isDay = 1): { label: string; icon: string } {
  if (code === null) return { label: 'Prognoza', icon: 'thermometer' };
  if (code === 0 || code === 1) return { label: code === 0 ? 'Bezchmurnie' : 'Pogodnie', icon: isDay === 0 ? 'moon' : 'sun' };
  if (code === 2) return { label: 'Częściowe zachmurzenie', icon: isDay === 0 ? 'cloud' : 'partly' };
  if (code === 3) return { label: 'Pochmurno', icon: 'cloud' };
  if ([45, 48].includes(code)) return { label: 'Mgła', icon: 'mist' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Śnieg', icon: 'snow' };
  if (code >= 95) return { label: 'Burze', icon: 'storm' };
  if ([56, 57, 66, 67].includes(code)) return { label: 'Marznące opady', icon: 'rain' };
  if ([51, 53, 55].includes(code)) return { label: 'Mżawka', icon: 'rain' };
  if ([61, 63, 65, 80, 81, 82].includes(code)) return { label: 'Deszcz', icon: 'rain' };
  return { label: 'Prognoza', icon: 'thermometer' };
}

export function upcomingHours(forecast: Forecast, now: number, horizon = 12): ForecastHour[] {
  const start = Math.floor(now / 3_600_000) * 3600;
  return forecast.hours.filter(h => h.time >= start && h.time < start + horizon * 3600);
}

export function outfitAdvice(forecast: Forecast | null, now: number) {
  // Saved or incomplete forecasts must never turn into confident clothing advice.
  if (!forecast || now - Date.parse(forecast.fetchedAt) > 90 * 60_000 || !Number.isFinite(Date.parse(forecast.fetchedAt))) return null;
  const hours = upcomingHours(forecast, now);
  if (hours.length !== 12 || hours.some((h, i) => i > 0 && h.time - hours[i - 1].time !== 3600) || hours.some(h => h.apparent === null || h.wind === null || h.rainChance === null || h.precipitation === null)) return null;
  const min = Math.min(...hours.map(h => h.apparent!));
  const max = Math.max(...hours.map(h => h.apparent!));
  const wind = Math.max(...hours.map(h => h.wind!));
  const gusts = Math.max(...hours.map(h => h.gusts ?? h.wind!));
  const rainChance = Math.max(...hours.map(h => h.rainChance!));
  const wet = hours.some(h => h.rainChance! >= 40 || h.precipitation! >= 0.2);
  const snow = hours.some(h => [71, 73, 75, 77, 85, 86].includes(h.code ?? -1));
  const freezing = hours.some(h => [56, 57, 66, 67].includes(h.code ?? -1));
  const storm = hours.some(h => (h.code ?? 0) >= 95);
  const title = min <= 0 ? 'Ciepła kurtka i dodatki' : min <= 8 ? 'Ciepła kurtka + sweter' : min <= 15 ? 'Kurtka + długi rękaw' : min <= 21 ? 'Lekka warstwa na wierzch' : 'T-shirt i lekkie ubranie';
  const base = min <= 0 ? 'Długie spodnie, czapka, szalik i rękawiczki.' : min <= 8 ? 'Długie spodnie i zakryte buty.' : min <= 15 ? 'Sweter lub bluza pod kurtkę, długie spodnie.' : min <= 21 ? 'T-shirt pod rozpinaną bluzę lub lekką kurtkę.' : 'Przewiewny materiał; na chłodniejsze chwile lekka bluza.';
  const tips: { icon: string; text: string }[] = [{ icon: 'layers', text: base }];
  if (max - min >= 7) tips.push({ icon: 'thermometer', text: 'Ubierz się warstwowo — temperatura wyraźnie się zmieni.' });
  if (freezing) tips.push({ icon: 'snow', text: 'Marznące opady — wybierz buty z dobrą przyczepnością.' });
  else if (snow) tips.push({ icon: 'snow', text: 'Na śnieg wybierz nieprzemakalne buty i kurtkę.' });
  else if (wet) tips.push({ icon: 'rain', text: wind >= 25 || gusts >= 40 ? 'Weź kurtkę z kapturem — opady i wiatr.' : 'Weź parasol lub kurtkę przeciwdeszczową.' });
  if (wind >= 25 || gusts >= 40) tips.push({ icon: 'wind', text: `Przyda się osłona od wiatru. Porywy do ${Math.round(gusts)} km/h.` });
  if (storm) tips.push({ icon: 'storm', text: 'Prognozowane burze — uwzględnij je, planując wyjście.' });
  return { title, tips, min, max, rainChance, wind, gusts, from: hours[0].time, to: hours[0].time + 12 * 3600 };
}
