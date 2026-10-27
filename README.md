# PaczkoMeteo

Mobilna PWA: lokalne pomiary z paczkomatów InPost, osobna prognoza Open-Meteo i podpowiedź ubioru na najbliższe 12 godzin. Svelte 5, SvelteKit 3 i TypeScript. Działa na Vercel bez dodatkowego serwera, Pythona, cookies i kluczy API.

[Aplikacja](https://paczko-meteo.vercel.app/)

## Dane

Aplikacja pobiera pomiary bezpośrednio z publicznego API Points:

```text
GET https://api-pl-points.easypack24.net/v1/points/{kod}/air-sensors
```

Odpowiedź zawiera wartości pomiarów, ocenę jakości powietrza i przedział czasu `fromDateTime`–`tillDateTime`. To odczyty InPost, nie prognoza modelu pogodowego. Endpoint został znaleziony dzięki [poprawce InPost Air #155](https://github.com/CyberDeer/InPost-Air/pull/155). Historia diagnozy 403 i wyniki weryfikacji: [docs/inpost-403.md](docs/inpost-403.md).

**404** oznacza brak udostępnionych pomiarów tego punktu. TOR75M zwraca 404, dlatego domyślnie sprawdzana jest też jego okolica. Braki nie są zastępowane zerami ani danymi z innego dostawcy. Dostępność i format API mogą się zmienić.

## Prognoza i ubiór

Osobny endpoint `/forecast?lat=52.99717&lon=18.63305` pobiera z [Open-Meteo](https://open-meteo.com/en/docs) prognozę godzinową i trzy dni: temperaturę, odczuwalną, prawdopodobieństwo/ilość opadów, wiatr/porywy i kody WMO. Źródła mają osobne stany ładowania i błędów. Prognoza nie zastępuje brakujących odczytów InPost.

Podpowiedź ubioru to jawna heurystyka: najniższa odczuwalna z najbliższych 12 h, zmiany temperatury, opady i wiatr. Nie pokazujemy jej offline, przy zapisanej prognozie, brakujących godzinach/parametrach ani po 90 minutach od pobrania. Timestampy Unix są formatowane w Europe/Warsaw. Cache prognozy: 15 minut na serwerze, 5 minut w przeglądarce; ostatnia prognoza jest zapisywana lokalnie z oznaczeniem aktualności.

Kierunek kolejnych zmian i kryteria odbioru: [roadmapa](docs/ROADMAP.md). Najwyższy priorytet: własne godziny wyjścia i powrotu, następnie preferencje ubioru.

## Agregacja okolicy

Wybierz promień 1, 3 lub 5 km albo pojedynczy punkt. Aplikacja sprawdza do 8 najbliższych lokalizacji i oblicza **medianę osobno dla każdego parametru**. Każdy parametr jest obliczany z własnego zestawu dostępnych próbek. Rozwijana lista pokazuje wyłącznie punkty z dostępnymi pomiarami i ich odległości. Kategorie indeksu powietrza nie są uśredniane.

Wybór i ostatnie udane pomiary są zapisywane na urządzeniu. PWA otwiera się offline po pierwszym użyciu online. Odświeżanie co 5 minut podczas używania aplikacji. Cache serwera: 5 minut dla pomiarów, 30 sekund dla błędów. Interfejs pokazuje czas pobrania i dostępny zakres czasu danych.

## Uruchomienie

Node.js 24:

```sh
npm ci
npm run dev -- --open
```

Podgląd produkcyjny z service workerem:

```sh
npm run build
npm run preview
```

## Vercel

Zaimportuj repozytorium: framework **SvelteKit**, Node.js **24.x**, instalacja `npm ci`, build `npm run build`, domyślny Output Directory. Bez obowiązkowych zmiennych środowiskowych i bazy danych. Adapter Vercel jest skonfigurowany.

Można również wdrożyć przez CLI:

```sh
npx vercel --prod
```

Agregacja jest dostępna pod `/weather?station=TOR75M&radius=3000`. Starszy adres `/api/weather` przekierowuje na nią na Vercel. Dostępne promienie w metrach: `0`, `1000`, `3000`, `5000`.

## Sprawdzenie

```sh
npm run check
npm test
npm run build
npm run test:e2e
node scripts/check-inpost.mjs
```

Testy sprawdzają prognozę, reguły ubioru, niezależność źródeł, format Points API, wartości zerowe i brakujące, daty pomiarów, 403/404, niezależność parametrów, agregację, wybór paczkomatu i offline. Testy rzeczywistej dostępności wymagają internetu. Na nowym komputerze: `npx playwright install chromium`.

Workflow „Check public InPost API” wykonuje jednorazowy odczyt zwykłym Node.js na GitHub Actions; nie uruchamia cyklicznego pobierania.

Ikony: `npm run icons`. Instalacja PWA: iPhone/Safari → Udostępnij → Do ekranu głównego; Android/Chrome → menu ⋮ → Dodaj do ekranu głównego.

Niezależny projekt, nie jest oficjalną aplikacją InPost.
