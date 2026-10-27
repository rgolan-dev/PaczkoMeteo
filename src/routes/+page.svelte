<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '#lib/Icon.svelte';
  import { DEFAULT_STATION, LEVELS, number, time, distanceLabel, type WeatherData } from '#lib/weather.ts';

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
  const station = $derived(data?.station ?? DEFAULT_STATION);
  const level = $derived(data?.sensors.level ? LEVELS[data.sensors.level] : null);
  const stale = $derived(!!data && (now - Date.parse(data.fetchedAt) > 20 * 60_000 || data.nearby?.some(point => point.sensors.status === 'available' && point.sensors.measuredTo && now - Date.parse(point.sensors.measuredTo) > 20 * 60_000)));
  const aggregation = $derived(data?.aggregation);
  const hasReadings = $derived(data?.sensors.status === 'available');
  const pollutants = [ { key: 'PM25', label: 'PM 2,5' }, { key: 'PM10', label: 'PM 10' }, { key: 'O3', label: 'O₃' }, { key: 'NO2', label: 'NO₂' } ];

  // Keep preferences and offline readings from the previous app name.
  function readStorage(key: string) { try { return localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^paczkometeo-/, 'pogodynka-')); } catch { return null; } }
  function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ } }

  async function load(code = stationCode, change = false): Promise<boolean> {
    const id = ++requestId;
    const requestedRadius = radius;
    if (change) changing = true; else loading = true;
    error = ''; formError = '';
    try {
      const response = await fetch(`/weather?station=${encodeURIComponent(code)}&radius=${requestedRadius}`, { signal: AbortSignal.timeout(25_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Nie udało się pobrać danych.');
      if (id !== requestId) return false;
      data = result;
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
  <meta name="description" content="Temperatura i jakość powietrza z czujników paczkomatu InPost." />
</svelte:head>

<div class="app-shell">
  <header class="header">
    <a href="/" class="brand" aria-label="PaczkoMeteo"><span class="brand-icon"><Icon name="sun" size={24}/></span>PaczkoMeteo</a>
    <div class="header-actions">
      {#if !installed}<button class="icon-button" onclick={install} aria-label="Zainstaluj aplikację" title="Zainstaluj"><Icon name="download" size={19}/></button>{/if}
      <button class="icon-button" onclick={() => sourcesDialog.showModal()} aria-label="O danych" title="O danych"><Icon name="info" size={19}/></button>
    </div>
  </header>
  <main>
    <h1 class="sr-only">Pomiary paczkomatu {station.code}</h1>
    <div class="station-toolbar">
      <button class="station-picker" onclick={() => { codeInput = stationCode; formError = ''; stationDialog.showModal(); }}>
        <Icon name="pin" size={22}/><span><strong>{station.city} · {station.code}</strong><span class="station-address">{station.address}</span></span><Icon name="chevron" size={17}/>
      </button>
      <button class="refresh-button" onclick={() => load()} disabled={loading || changing}><span class:spinning={loading}><Icon name="refresh" size={18}/></span><span>{loading ? 'Pobieranie…' : 'Odśwież'}</span></button>
    </div>

    <div class="scope-controls"><label for="radius">Pomiary</label><select id="radius" bind:value={radius} onchange={() => load()}><option value={0}>Tylko {stationCode}</option><option value={1000}>Okolica · 1 km</option><option value={3000}>Okolica · 3 km</option><option value={5000}>Okolica · 5 km</option></select><span>Maks. 8 najbliższych punktów</span></div>

    {#if offline || saved || stale || error}
      <div class="notice" role="status"><Icon name={offline ? 'offline' : 'info'} size={18}/><span>{error || (offline ? 'Offline — zapisane pomiary.' : saved ? 'Zapisane pomiary.' : 'Pomiary mogą być nieaktualne.')}{#if data} Pobrano {new Date(data.fetchedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}.{/if}</span></div>
    {/if}

    {#if hasReadings && data}
      <div class="dashboard">
        <section class="weather-card" aria-label="Pogoda z paczkomatu">
          <div class="section-heading"><h2>Temperatura</h2><Icon name="thermometer" size={22}/></div>
          <div class="temperature">{number(data.sensors.values.TEMPERATURE, 1)}<span>°C</span></div>
          {#if aggregation?.readings.TEMPERATURE}<p class="aggregate-caption">Mediana z {aggregation.readings.TEMPERATURE.sources.length} pkt. · zakres {number(aggregation.readings.TEMPERATURE.min, 1)}–{number(aggregation.readings.TEMPERATURE.max, 1)}°C</p>{/if}
          <div class="weather-metrics">
            <div><Icon name="drop" size={21}/><span>Wilgotność<strong>{number(data.sensors.values.HUMIDITY)} <small>%</small></strong>{#if aggregation}<small class="reading-count">{aggregation.readings.HUMIDITY?.sources.length ?? 0} pkt.</small>{/if}</span></div>
            <div><Icon name="gauge" size={21}/><span>Ciśnienie<strong>{number(data.sensors.values.PRESSURE, 1)} <small>hPa</small></strong>{#if aggregation}<small class="reading-count">{aggregation.readings.PRESSURE?.sources.length ?? 0} pkt.</small>{/if}</span></div>
          </div>
        </section>
        <section class="panel air-panel">
          <div class="section-heading"><h2>Jakość powietrza</h2><Icon name="leaf" size={22}/></div>
          {#if level}<div class="air-status" style={`color:${level.color}`}><span class="status-dot"></span><strong>{level.label}</strong></div>{/if}
          {#if pollutants.some(pollutant => data?.sensors.values[pollutant.key] != null)}
            <div class="pollutants">{#each pollutants as pollutant}<div><span>{pollutant.label}</span><strong>{number(data.sensors.values[pollutant.key], 1)} <small>µg/m³</small></strong>{#if aggregation}<span class="reading-count">{aggregation.readings[pollutant.key]?.sources.length ?? 0} pkt.</span>{/if}</div>{/each}</div>
          {:else}<p class="empty-air">Brak pomiarów jakości powietrza.</p>{/if}
        </section>
      </div>
      <p class="reading-source">InPost{aggregation ? " · mediany z okolicy" : ""} · pobrano {data.sensors.retrievedAt ? time(data.sensors.retrievedAt) : '—'}{#if data.sensors.measuredFrom && data.sensors.measuredTo} · dane {time(data.sensors.measuredFrom)}–{time(data.sensors.measuredTo)}{/if}</p>
    {:else if loading && !data}
      <div class="empty-readings" role="status"><span class="spinning"><Icon name="refresh" size={25}/></span><p>Pobieranie pomiarów InPost…</p></div>
    {:else}
      <section class="empty-readings" aria-labelledby="readings-unavailable">
        <span class="empty-icon"><Icon name="box" size={28}/></span>
        <h2 id="readings-unavailable">Nie udało się pobrać pomiarów</h2>
        <p>{error || data?.sensors.message || 'Brak połączenia z InPost.'}</p>
        <a class="text-link" href={station.url} target="_blank" rel="noreferrer">Otwórz stronę paczkomatu<Icon name="external" size={14}/></a>
      </section>
    {/if}

    {#if data?.nearby?.length}
      <details class="points-list" open={!hasReadings}><summary>Punkty · {data.nearby.filter(point => point.sensors.status === 'available').length}/{data.nearby.length} z pomiarami</summary>
        {#if aggregation?.discoveryError}<p class="discovery-error">{aggregation.discoveryError}</p>{/if}
        {#each data.nearby as point}<div class="point-row"><div><a href={point.station.url} target="_blank" rel="noreferrer">{point.station.code}<Icon name="external" size={11}/></a><span>{point.station.address} · {distanceLabel(point.distance)}</span></div><div class="point-state" class:available={point.sensors.status === 'available'}>{#if point.sensors.status === 'available'}<strong>{point.sensors.values.TEMPERATURE != null ? `${number(point.sensors.values.TEMPERATURE, 1)}°C` : ''}{point.sensors.values.PM25 != null ? ` · PM2,5 ${number(point.sensors.values.PM25, 1)}` : ''}</strong><span>Pobrano {point.sensors.retrievedAt ? time(point.sensors.retrievedAt) : '—'}</span>{:else}<strong>{point.sensors.httpStatus ? `HTTP ${point.sensors.httpStatus}` : 'Brak danych'}</strong><span>{point.sensors.status === 'blocked' ? 'Dostęp odrzucony' : point.sensors.httpStatus === 404 ? 'Brak pomiarów' : 'Odczyt niedostępny'}</span>{/if}</div></div>{/each}
      </details>
    {/if}
  </main>
</div>

<dialog bind:this={stationDialog} class="modal">
  <div class="modal-heading"><h2>Wybierz paczkomat</h2><button class="icon-button" aria-label="Zamknij wybór paczkomatu" onclick={() => stationDialog.close()}><Icon name="close"/></button></div>
  <form onsubmit={changeStation}><label for="station-code">Kod paczkomatu</label><input id="station-code" bind:value={codeInput} placeholder="np. TOR75M" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required aria-describedby="station-error"/><p id="station-error" class="form-error" role="status">{formError}</p><button type="submit" class="button primary" disabled={changing}>{changing ? 'Szukamy…' : 'Wybierz paczkomat'}<Icon name="arrow" size={18}/></button></form>
</dialog>

<dialog bind:this={installDialog} class="modal">
  <div class="modal-heading"><h2>Zainstaluj</h2><button class="icon-button" aria-label="Zamknij instrukcję instalacji" onclick={() => installDialog.close()}><Icon name="close"/></button></div>
  <div class="instruction"><strong>iPhone · Safari</strong><p>Udostępnij → Do ekranu głównego → Dodaj.</p></div><div class="instruction"><strong>Android · Chrome</strong><p>Menu ⋮ → Dodaj do ekranu głównego.</p></div>
</dialog>

<dialog bind:this={sourcesDialog} class="modal">
  <div class="modal-heading"><h2>Dane InPost</h2><button class="icon-button" aria-label="Zamknij informacje o danych" onclick={() => sourcesDialog.close()}><Icon name="close"/></button></div>
  <p>Tryb okolicy sprawdza maksymalnie 8 najbliższych paczkomatów w wybranym promieniu. Każda wartość to mediana dostępnych odczytów danego parametru. Punkty bez pomiaru nie wchodzą do obliczeń. Jedna próbka oznacza wartość z jednego punktu.</p><p>Temperatura, wilgotność, ciśnienie i jakość powietrza pochodzą wyłącznie z czujników udostępnianych przez InPost. Brakujące pomiary pozostają puste.</p><p>API podaje przedział czasu, z którego pochodzą pomiary. Przy agregacji pokazujemy zakres obejmujący dostępne próbki oraz czas pobrania. Odświeżanie co 5 minut, gdy aplikacja jest otwarta.</p>
  <a class="text-link" href={station.url} target="_blank" rel="noreferrer">Strona paczkomatu<Icon name="external" size={14}/></a>
</dialog>
