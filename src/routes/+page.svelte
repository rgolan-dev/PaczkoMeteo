<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '#lib/Icon.svelte';
  import { DEFAULT_STATION, LEVELS, number, time, distanceLabel, type WeatherData, type Station } from '#lib/weather.ts';

  import { outfitAdvice, upcomingHours, weatherCondition, type Forecast } from '#lib/forecast.ts';

  interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
  let data = $state<WeatherData | null>(null);
  let loading = $state(true);
  let error = $state('');
  let offline = $state(false);
  let saved = $state(false);
  let now = $state(Date.now());
  let stationCode = $state(DEFAULT_STATION.code);
  let radius = $state(3000);
  let codeInput = $state('');
  let formError = $state('');
  let changing = $state(false);
  let stationDialog: HTMLDialogElement;
  let installDialog: HTMLDialogElement;
  let sourcesDialog: HTMLDialogElement;
  let installPrompt = $state<InstallPrompt | null>(null);
  let installed = $state(false);
  let requestId = 0;
  let forecastId = 0;
  let forecast = $state<Forecast | null>(null);
  let forecastLoading = $state(true);
  let forecastError = $state('');
  let forecastSaved = $state(false);
  let forecastLocation = '';
  const forecastStale = $derived(!!forecast && now - Date.parse(forecast.fetchedAt) > 90 * 60_000);
  const advice = $derived(!offline && !forecastSaved ? outfitAdvice(forecast, now) : null);
  const hours = $derived(forecast ? upcomingHours(forecast, now).filter((_, i) => i % 2 === 0) : []);
  const condition = $derived(weatherCondition(forecast?.current.code ?? null, forecast?.current.isDay ?? 1));
  const today = $derived(forecast?.days.find(day => dateKey(day.time * 1000) === dateKey(now)));
  function dateKey(ms: number) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(ms); }
  function dayLabel(seconds: number, index: number) { return dateKey(seconds * 1000) === dateKey(now) ? 'Dzisiaj' : index === 1 ? 'Jutro' : new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'long' }).format(seconds * 1000); }

  async function loadForecast(location: Station) {
    const key = `${location.latitude},${location.longitude}`;
    const id = ++forecastId;
    if (forecastLocation !== key) {
      forecast = null;
      forecastSaved = false;
      forecastLocation = key;
      try {
        const stored = JSON.parse(readStorage(`paczkometeo-forecast-${key}`) ?? 'null');
        if (stored?.hours?.length && stored.current && Array.isArray(stored.days) && Number.isFinite(Date.parse(stored.fetchedAt))) { forecast = stored; forecastSaved = true; }
      } catch { /* Ignore invalid saved forecasts. */ }
    }
    forecastLoading = true; forecastError = '';
    try {
      const response = await fetch(`/forecast?lat=${location.latitude}&lon=${location.longitude}`, { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('Prognoza jest chwilowo niedostępna.');
      const result: Forecast = await response.json();
      if (id !== forecastId) return;
      forecast = result; forecastSaved = false; now = Date.now();
      writeStorage(`paczkometeo-forecast-${key}`, JSON.stringify(result));
    } catch {
      if (id !== forecastId) return;
      forecastSaved = !!forecast;
      forecastError = 'Nie udało się odświeżyć prognozy.';
    } finally { if (id === forecastId) forecastLoading = false; }
  }

  const station = $derived(data?.station ?? DEFAULT_STATION);
  const stale = $derived(!!data && (now - Date.parse(data.fetchedAt) > 20 * 60_000 || data.nearby?.some(point => point.sensors.status === 'available' && point.sensors.measuredTo && now - Date.parse(point.sensors.measuredTo) > 20 * 60_000)));
  const aggregation = $derived(data?.aggregation);
  const temperatureSources = $derived(aggregation?.readings.TEMPERATURE?.sources.length ?? (data?.sensors.values.TEMPERATURE != null ? 1 : 0));
  const hasReadings = $derived(data?.sensors.status === 'available');
  const measurementPoints = $derived(data?.nearby?.filter(point => point.sensors.status === 'available') ?? []);
  const sourceLevel = $derived(data?.sensors.level ?? (measurementPoints.length === 1 ? measurementPoints[0].sensors.level : null));
  const level = $derived(sourceLevel ? LEVELS[sourceLevel] : null);
  const unavailableMessage = $derived(data?.sensors.status === 'blocked' ? 'Pomiary są chwilowo niedostępne. Spróbuj odświeżyć później.' : data?.sensors.message);
  const pollutants = [ { key: 'PM25', label: 'PM 2,5' }, { key: 'PM10', label: 'PM 10' }, { key: 'O3', label: 'O₃' }, { key: 'NO2', label: 'NO₂' } ];

  // Keep preferences and offline readings from the previous app name.
  function readStorage(key: string) { try { return localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^paczkometeo-/, 'pogodynka-')); } catch { return null; } }
  function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ } }

  async function load(code = stationCode, change = false): Promise<boolean> {
    const id = ++requestId;
    const requestedRadius = radius;
    if (change) changing = true; else loading = true;
    error = ''; formError = '';
    if (!change && (data || code === DEFAULT_STATION.code)) void loadForecast(station);
    try {
      const response = await fetch(`/weather?station=${encodeURIComponent(code)}&radius=${requestedRadius}`, { signal: AbortSignal.timeout(25_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Nie udało się pobrać danych.');
      if (id !== requestId) return false;
      data = result;
      if (forecastLocation !== `${result.station.latitude},${result.station.longitude}`) void loadForecast(result.station);
      stationCode = result.station.code;
      saved = false;
      now = Date.now();
      writeStorage('paczkometeo-station', stationCode);
      writeStorage('paczkometeo-radius', String(requestedRadius));
      if (result.sensors.status === 'available') writeStorage(`paczkometeo-inpost-${stationCode}-${requestedRadius}`, JSON.stringify(result));
      return true;
    } catch (cause) {
      if (id !== requestId) return false;
      const message = offline ? 'Jesteś offline. Połącz się z internetem, aby pobrać nowe dane.' : cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Połączenie trwa zbyt długo. Spróbuj ponownie.';
      if (!forecastLocation && !change) forecastLoading = false;
      if (change) formError = message;
      else { error = message; saved = !!data; }
      return false;
    } finally { if (id === requestId) { loading = false; changing = false; } }
  }

  async function changeStation(event: SubmitEvent) {
    event.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,12}$/.test(code)) { formError = 'Wpisz kod złożony z liter i cyfr, np. TOR75M.'; return; }
    if (await load(code, true)) stationDialog.close();
  }

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
    } else installDialog.showModal();
  }

  onMount(() => {
    offline = !navigator.onLine;
    installed = matchMedia('(display-mode: standalone)').matches;
    const storedRadius = Number(readStorage('paczkometeo-radius') ?? 3000);
    if ([0, 1000, 3000, 5000].includes(storedRadius)) radius = storedRadius;
    const storedStation = readStorage('paczkometeo-station');
    if (storedStation && /^[A-Z0-9]{3,12}$/.test(storedStation)) stationCode = storedStation;
    try {
      const stored = JSON.parse(readStorage(`paczkometeo-inpost-${stationCode}-${radius}`) ?? 'null');
      if (stored?.station?.code === stationCode && stored.sensors?.status === 'available' && stored.sensors.values && Number.isFinite(Date.parse(stored.fetchedAt))) { data = stored; saved = true; }
    } catch { /* Ignore outdated local data. */ }
    void load();
    const online = () => { offline = false; void load(); };
    const disconnected = () => { offline = true; };
    const prompt = (event: Event) => { event.preventDefault(); installPrompt = event as InstallPrompt; };
    const appInstalled = () => { installed = true; installPrompt = null; };
    const visible = () => { if (document.visibilityState === 'visible') { now = Date.now(); if (!data || now - Date.parse(data.fetchedAt) > 300_000) void load(); } };
    window.addEventListener('online', online);
    window.addEventListener('offline', disconnected);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', appInstalled);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => { now = Date.now(); if (document.visibilityState === 'visible' && navigator.onLine && !loading && !changing) void load(); }, 300_000);
    return () => { clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('offline', disconnected); window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', appInstalled); document.removeEventListener('visibilitychange', visible); };
  });
</script>

<svelte:head>
  <title>PaczkoMeteo — {station.code}</title>
  <meta name="description" content="Pomiary paczkomatów InPost, prognoza na kolejne godziny i podpowiedź, jak się ubrać." />
</svelte:head>

<div class="app-shell">
  <header class="header">
    <a href="/" class="brand" aria-label="PaczkoMeteo"><span class="brand-icon"><Icon name="box" size={21}/></span>Paczko<span class="brand-light">Meteo</span><span class="brand-dot"></span></a>
    <div class="header-actions">
      {#if !installed}<button class="icon-button" onclick={install} aria-label="Zainstaluj aplikację" title="Zainstaluj"><Icon name="download" size={20}/></button>{/if}
      <button class="icon-button" onclick={() => sourcesDialog.showModal()} aria-label="O danych" title="O danych"><Icon name="info" size={20}/></button>
    </div>
  </header>
  <main>
    <div class="station-toolbar">
      <div>
        <p class="eyebrow">Twoja okolica</p>
        <button class="station-picker" onclick={() => { codeInput = stationCode; formError = ''; stationDialog.showModal(); }} aria-label="Zmień paczkomat">
          <span><strong>{station.city || station.code}</strong><span class="station-address"><Icon name="pin" size={14}/>{station.address} <span>· {station.code}</span></span></span><Icon name="chevron" size={20}/>
        </button>
      </div>
      <button class="refresh-button" onclick={() => load()} disabled={loading || changing} aria-label="Odśwież dane"><span class:spinning={loading}><Icon name="refresh" size={18}/></span><span>Odśwież</span></button>
    </div>
    <h1 class="sr-only">Pogoda i pomiary w okolicy {station.code}</h1>

    {#if offline || saved || stale || error}
      <div class="notice" role="status"><Icon name={offline ? 'offline' : 'info'} size={18}/><span>{error || (offline ? 'Offline — zapisane pomiary.' : saved ? 'Zapisane pomiary.' : 'Pomiary mogą być nieaktualne.')}{#if data} Pobrano {new Date(data.fetchedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}.{/if}</span></div>
    {/if}

    <div class="hero-grid">
      {#if hasReadings && data}
        <section class="weather-card" aria-label="Pogoda z paczkomatu">
          <div class="section-heading"><h2>Temperatura w okolicy</h2><span class="source-chip"><span class="status-dot"></span>InPost</span></div>
          <div class="temperature-wrap" class:long-temperature={number(data.sensors.values.TEMPERATURE, 1).length > 4}>{#if data.sensors.values.TEMPERATURE != null}<div class="temperature">{number(data.sensors.values.TEMPERATURE, 1)}<span>°C</span></div>{:else}<p class="muted">Brak pomiaru temperatury</p>{/if}<div class="temperature-art" aria-hidden="true"><Icon name="thermometer" size={54}/></div></div>
          <p class="temperature-caption">{#if temperatureSources === 1 && measurementPoints.length === 1}Pomiar · {measurementPoints[0].station.code}{:else if temperatureSources > 1}Mediana z {temperatureSources} punktów{:else}Pomiar z czujnika paczkomatu{/if}{#if data.sensors.measuredTo}<span> · do {time(data.sensors.measuredTo)}</span>{/if}</p>
          <div class="weather-metrics">
            {#if data.sensors.values.HUMIDITY != null}<div><Icon name="drop" size={19}/><span>Wilgotność<strong>{number(data.sensors.values.HUMIDITY)}<small> %</small></strong></span></div>{/if}
            {#if data.sensors.values.PRESSURE != null}<div><Icon name="gauge" size={19}/><span>Ciśnienie<strong>{number(data.sensors.values.PRESSURE, 1)}<small> hPa</small></strong></span></div>{/if}
          </div>
        </section>
      {:else if loading && !data}
        <section class="weather-card skeleton-card" aria-busy="true" aria-label="Pobieranie pomiarów"><div class="skeleton short"></div><div class="skeleton big"></div><p>Pobieranie pomiarów InPost…</p><div class="skeleton"></div></section>
      {:else}
        <section class="empty-readings" aria-labelledby="readings-unavailable"><span class="empty-icon"><Icon name="box" size={32}/></span><h2 id="readings-unavailable">Nie udało się pobrać pomiarów</h2><p>{error || unavailableMessage || 'Brak połączenia z InPost.'}</p><a class="text-link" href={station.url} target="_blank" rel="noreferrer">Otwórz stronę paczkomatu<Icon name="external" size={14}/></a></section>
      {/if}

      <section class="outfit-card" aria-labelledby="outfit-title">
        <div class="section-heading"><h2 id="outfit-title">Jak się ubrać?</h2><span class="outfit-icon"><Icon name="jacket" size={24}/></span></div>
        {#if advice}
          <p class="outfit-horizon">Najbliższe 12 h · {time(advice.from)}–{time(advice.to)}</p>
          <h3>{advice.title}</h3>
          <ul class="outfit-tips">{#each advice.tips as tip}<li><Icon name={tip.icon} size={18}/><span>{tip.text}</span></li>{/each}</ul>
          <p class="outfit-basis">Odczuwalna {number(advice.min)}–{number(advice.max)}°C <span>· prognoza</span></p>
        {:else if forecastLoading && !forecast}<div class="skeleton short"></div><div class="skeleton"></div><p class="muted">Sprawdzanie temperatury, opadów i wiatru…</p>
        {:else}<h3>{offline ? 'Jesteś offline' : 'Czekamy na aktualną prognozę'}</h3><p class="muted">Podpowiedź pojawi się, gdy będą dostępne aktualne dane o temperaturze odczuwalnej, opadach i wietrze.</p><button class="text-link light" onclick={() => loadForecast(station)} disabled={forecastLoading}>Odśwież prognozę<Icon name="arrow" size={16}/></button>{/if}
      </section>
    </div>

    <section class="forecast-section" aria-labelledby="forecast-title">
      <div class="block-heading"><div><p class="eyebrow">Prognoza · Open-Meteo</p><h2 id="forecast-title">Kolejne godziny</h2></div>{#if forecast}<span class="forecast-state">{forecastSaved || offline ? 'Zapisana' : forecastStale ? 'Nieaktualna' : 'Aktualizacja'} {time(forecast.fetchedAt)}</span>{/if}</div>
      {#if forecast && hours.length}
        {#if forecastSaved || forecastStale || offline}<p class="forecast-notice" role="status">{forecastError || 'Prognoza została zapisana wcześniej.'} Sprawdź aktualne dane przed wyjściem.</p>{/if}
        <div class="forecast-summary"><span><Icon name={condition.icon} size={22}/>{condition.label}</span>{#if forecast.current.apparent != null}<span>Odczuwalna <strong>{number(forecast.current.apparent)}°C</strong></span>{/if}{#if forecast.current.wind != null}<span><Icon name="wind" size={18}/><strong>{number(forecast.current.wind)} <small>km/h</small></strong></span>{/if}</div>
        <div class="hourly-grid">{#each hours as hour, i}{@const weather = weatherCondition(hour.code, hour.isDay ?? 1)}<div class="hour-cell"><span class="hour-time">{i === 0 ? 'Teraz' : time(hour.time)}</span><span class="hour-icon" title={weather.label}><Icon name={weather.icon} size={29}/><span class="sr-only">{weather.label}</span></span><strong>{number(hour.temperature)}°</strong><span class="hour-rain"><Icon name="drop" size={12}/>{hour.rainChance === null ? '—' : number(hour.rainChance)}%</span></div>{/each}</div>
        <p class="forecast-footnote">Prawdopodobieństwo opadów pod każdą godziną</p>
      {:else if forecastLoading}<div class="forecast-skeleton" role="status"><div class="skeleton"></div><p>Pobieranie prognozy…</p></div>
      {:else}<div class="forecast-empty"><Icon name="cloud" size={26}/><p>{forecastError || 'Prognoza jest chwilowo niedostępna.'}</p><button class="text-link" onclick={() => loadForecast(station)}>Spróbuj ponownie<Icon name="refresh" size={15}/></button></div>{/if}
    </section>

    <div class="detail-grid">
      {#if hasReadings && data && pollutants.some(pollutant => data?.sensors.values[pollutant.key] != null)}
        <section class="panel air-panel" aria-label="Jakość powietrza">
          <div class="section-heading"><h2>Jakość powietrza</h2><Icon name="leaf" size={21}/></div>
          <div class="air-description">{#if level}<span class="air-status" style={`color:${level.color}`}><span class="status-dot"></span>{level.label}</span>{:else}<span>Lokalne pomiary</span>{/if}<span class="small-source">InPost</span></div>
          <div class="pollutants">{#each pollutants.filter(p => data?.sensors.values[p.key] != null) as pollutant}<div><span>{pollutant.label}</span><strong>{number(data.sensors.values[pollutant.key], 1)}<small> µg/m³</small></strong></div>{/each}</div>
        </section>
      {/if}
      {#if forecast && forecast.days.length}
        <section class="panel days-panel" aria-label="Prognoza na trzy dni"><div class="section-heading"><h2>Najbliższe dni</h2><span class="small-source">Prognoza</span></div><div class="days-list">{#each forecast.days as day, i}{@const weather = weatherCondition(day.code)}<div class="day-row"><span>{dayLabel(day.time, i)}</span><span class="day-icon" title={weather.label}><Icon name={weather.icon} size={22}/><span class="sr-only">{weather.label}</span></span><span class="day-rain">{day.rainChance == null ? '—' : number(day.rainChance)}%</span><span class="day-temp"><span>{number(day.min)}°</span><strong>{number(day.max)}°</strong></span></div>{/each}</div>{#if today?.sunrise && today?.sunset}<div class="sun-times"><span><Icon name="sunrise" size={18}/>Wschód <strong>{time(today.sunrise)}</strong></span><span><Icon name="sunset" size={18}/>Zachód <strong>{time(today.sunset)}</strong></span></div>{/if}</section>
      {/if}
    </div>

    <details class="points-list"><summary><span>Pomiary w okolicy</span><span class="summary-count">{measurementPoints.length} {temperatureSources === 1 && measurementPoints.length === 1 ? 'punkt' : 'pkt.'}<Icon name="chevron" size={16}/></span></summary>
      <div class="scope-controls"><label for="radius">Pomiary</label><select id="radius" bind:value={radius} onchange={() => load()}><option value={0}>Tylko {stationCode}</option><option value={1000}>Okolica · 1 km</option><option value={3000}>Okolica · 3 km</option><option value={5000}>Okolica · 5 km</option></select><p>Do 8 najbliższych paczkomatów. Pokazujemy punkty z pomiarami.</p></div>
      {#if aggregation?.readings.TEMPERATURE}{@const reading = aggregation.readings.TEMPERATURE}<p class="aggregate-caption">{reading.sources.length > 1 ? `Mediana z ${reading.sources.length} pkt. · zakres ${number(reading.min, 1)}–${number(reading.max, 1)}°C` : 'Temperatura z jednego punktu pomiarowego.'}</p>{/if}
      {#if aggregation?.discoveryError}<p class="discovery-error">{aggregation.discoveryError}</p>{/if}
      {#each measurementPoints as point}<div class="point-row"><div><a href={point.station.url} target="_blank" rel="noreferrer">{point.station.code}<Icon name="external" size={12}/></a><span>{point.station.address} · {distanceLabel(point.distance)}</span></div><div class="point-state"><strong>{point.sensors.values.TEMPERATURE != null ? `${number(point.sensors.values.TEMPERATURE, 1)}°C` : ''}{point.sensors.values.PM25 != null ? ` · PM2,5 ${number(point.sensors.values.PM25, 1)}` : ''}</strong><span>Pobrano {point.sensors.retrievedAt ? time(point.sensors.retrievedAt) : '—'}</span></div></div>{/each}
      {#if hasReadings && data}<p class="reading-source">InPost · pobrano {time(data.fetchedAt)}{#if data.sensors.measuredFrom && data.sensors.measuredTo} · dane {time(data.sensors.measuredFrom)}–{time(data.sensors.measuredTo)}{/if}</p>{/if}
      {#if !measurementPoints.length}<p class="muted">Brak dostępnych pomiarów w tym obszarze. Możesz wybrać większy promień.</p>{/if}
    </details>
    <footer class="app-footer"><div class="footer-brand"><strong>PaczkoMeteo</strong><span>Autor: <a href="https://rgolan.dev/" target="_blank" rel="noreferrer">rgolan.dev</a></span></div><button onclick={() => sourcesDialog.showModal()}>Źródła i pomiary<Icon name="arrow" size={14}/></button></footer>
  </main>
</div>

<dialog bind:this={stationDialog} class="modal">
  <div class="modal-heading"><h2>Wybierz paczkomat</h2><button class="icon-button" aria-label="Zamknij wybór paczkomatu" onclick={() => stationDialog.close()}><Icon name="close"/></button></div>
  <p>Prognoza i pobliskie pomiary dopasują się do jego lokalizacji.</p>
  <form onsubmit={changeStation}><label for="station-code">Kod paczkomatu</label><input id="station-code" bind:value={codeInput} placeholder="np. TOR75M" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required aria-describedby="station-error"/><p id="station-error" class="form-error" role="status">{formError}</p><button type="submit" class="button primary" disabled={changing}>{changing ? 'Szukamy…' : 'Wybierz paczkomat'}<Icon name="arrow" size={18}/></button></form>
</dialog>
<dialog bind:this={installDialog} class="modal"><div class="modal-heading"><h2>Zainstaluj</h2><button class="icon-button" aria-label="Zamknij instrukcję instalacji" onclick={() => installDialog.close()}><Icon name="close"/></button></div><div class="instruction"><strong>iPhone · Safari</strong><p>Udostępnij → Do ekranu głównego → Dodaj.</p></div><div class="instruction"><strong>Android · Chrome</strong><p>Menu ⋮ → Dodaj do ekranu głównego.</p></div></dialog>
<dialog bind:this={sourcesDialog} class="modal"><div class="modal-heading"><h2>Źródła danych</h2><button class="icon-button" aria-label="Zamknij informacje o danych" onclick={() => sourcesDialog.close()}><Icon name="close"/></button></div>
  <h3>Pomiary · InPost</h3><p>Temperatura w okolicy, wilgotność, ciśnienie i jakość powietrza pochodzą z czujników InPost. Sprawdzamy do 8 najbliższych punktów. W trybie okolicy liczymy medianę osobno dla każdego parametru. Punkty bez pomiarów są pomijane; brakujących wartości nie zastępujemy prognozą. Przedział czasu odczytów i lista punktów znajdują się w „Pomiary w okolicy”.</p>
  <h3>Prognoza · Open-Meteo</h3><p>Warunki pogodowe, temperatura odczuwalna, opady, wiatr i kolejne dni są prognozą modelową dla lokalizacji wybranego paczkomatu. To osobne źródło, niezależne od czujników InPost.</p>
  <h3>Podpowiedź ubioru</h3><p>Orientacyjna propozycja na najbliższe 12 godzin, według najniższej temperatury odczuwalnej, zmian temperatury, opadów i wiatru. Nie uwzględnia Twojej aktywności ani indywidualnego odczuwania zimna. Zapisana lub nieaktualna prognoza nie generuje podpowiedzi.</p>
  <p>Odświeżamy dane co 5 minut podczas używania aplikacji. Niezależny projekt.</p><div class="source-links"><a class="text-link" href={station.url} target="_blank" rel="noreferrer">InPost<Icon name="external" size={14}/></a><a class="text-link" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo.com<Icon name="external" size={14}/></a></div>
</dialog>
