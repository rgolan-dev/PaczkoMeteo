# PaczkoMeteo

Mobilna PWA: temperatura, wilgotność, ciśnienie i jakość powietrza z czujników paczkomatów InPost. Interfejs Svelte 5 / SvelteKit 3, agregacja w TypeScript, odczyt pomiarów przez `curl_cffi` w małej funkcji Python.

[Aplikacja](https://paczko-meteo.vercel.app/)

**Status odczytów (27.10.2026):** interfejs i wdrożenie działają, ale InPost nadal zwraca 403 z Vercel. Sprawdzone runnery GitHub Actions (Linux i macOS) również otrzymały 403. Lokalny kolektor pobiera rzeczywiste pomiary z TOR02BAPP. Nie ma jeszcze potwierdzonego rozwiązania działającego wyłącznie na GitHub + Vercel; zmiana transportu i regionu nie usunęła blokady. Szczegóły oraz odnośniki do testów są w [raporcie](docs/inpost-403.md).

## Agregacja okolicy

Wybierz paczkomat i promień 1, 3 lub 5 km albo pomiary pojedynczego punktu. Aplikacja sprawdza maksymalnie 8 najbliższych lokalizacji. Każdy parametr jest agregowany osobno jako **mediana** dostępnych odczytów; obok wartości jest liczba próbek. Braki i błędy nie są traktowane jako zera. Lista punktów pokazuje odległości i statusy. Kategorii indeksu powietrza nie uśredniamy.

Wybór i ostatnie udane pomiary są zapisywane na urządzeniu. PWA działa offline po pierwszym otwarciu online. Odświeżanie co 5 minut przy otwartej aplikacji. Cache serwera: 5 minut dla pomiarów, 30 sekund dla błędów.

## Uruchomienie lokalne

Node.js 24 i Python 3.12. Przy pierwszym uruchomieniu:

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run dev -- --open
```

`npm run dev` i `npm run preview` uruchamiają również lokalną funkcję Python na `127.0.0.1:8787`. Można wskazać interpreter przez `PYTHON_BIN` i port przez `PACZKOMETEO_API_PORT`.

```sh
npm run build
npm run preview
```

## Vercel

Zaimportuj repozytorium: framework **SvelteKit**, Node.js **24.x**, instalacja `npm ci`, build `npm run build`, domyślny Output Directory. Vercel buduje osobną funkcję `api/inpost.py` z Pythonem 3.12 i zależnościami z `requirements.txt`. `vercel.json` ustawia region Frankfurt i limit czasu funkcji. Bez bazy danych i obowiązkowych zmiennych środowiskowych.

Kod aplikacji używa `/weather` do agregacji i `/api/inpost` do odczytu pomiarów. SvelteKit celowo nie ma tras `/api/*`, ponieważ ten zakres zajmuje funkcja Python. Publikuj ze źródeł przez integrację Git lub CLI:

```sh
npx vercel --prod
```

## Dostępność danych InPost

To nieoficjalny interfejs publicznych stron paczkomatów, bez gwarancji dostępności. `curl_cffi` używa anonimowej sesji strony i żądania POST. Sprawdzana jest również angielska strona, jeśli polska nie udostępnia interfejsu pomiarowego.

**403 / Cloudflare** oznacza odmowę dostępu. **404 z interfejsu pomiarów** oznacza, że punkt nie udostępnia obecnie odczytów. To różne sytuacje. Zmiana klienta HTTP nie gwarantuje dostępu z każdego adresu IP.

TOR75M zwracał 404 `Air sensors are not available.` Dlatego domyślnie sprawdzamy też okoliczne punkty. InPost nie podaje czasu pomiaru — wyświetlamy czas pobrania. Dane modelowe nie zastępują brakujących odczytów.

Szczegóły w [docs/inpost-403.md](docs/inpost-403.md).

## Sprawdzenie

```sh
npm run check
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
npm run build
npm run test:e2e
```

Testy sprawdzają parser, mediany, dostępność poszczególnych parametrów, obsługę 403/404, angielską stronę zapasową, walidację dozwolonych adresów, agregację, wybór paczkomatu i offline. Test rzeczywistej dostępności InPost wymaga internetu. Na nowym komputerze: `npx playwright install chromium`.

Ikony: `npm run icons` (źródło: `static/icon.svg`). Instalacja PWA: iPhone/Safari → Udostępnij → Do ekranu głównego; Android/Chrome → menu ⋮ → Dodaj do ekranu głównego.

Niezależny projekt, nie jest oficjalną aplikacją InPost.
