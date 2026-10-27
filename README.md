# PaczkoMeteo

Prosta PWA w Svelte 5, SvelteKit 3 i TypeScript: temperatura, wilgotność, ciśnienie i jakość powietrza **z czujników InPost**. Domyślny paczkomat: TOR75M, Okólna 141, Toruń. Bez danych zastępczych z modeli pogodowych. Domyślnie agreguje maksymalnie 8 najbliższych punktów w promieniu 3 km.

## Uruchomienie

Node.js 24:

```sh
npm ci
npm run dev -- --open
```

## Agregacja okolicy

Wybierz promień 1, 3 lub 5 km albo pojedynczy paczkomat. Lista pochodzi z ShipX Points, jest sortowana po odległości i ograniczona do 8 punktów. Pomiary są pobierane z maksymalnie 3 punktów jednocześnie, z łącznym limitem czasu 18 sekund.

Każdy parametr jest agregowany osobno jako **mediana** dostępnych wartości. Przykładowo temperatura może pochodzić z 3 punktów, a PM2,5 z jednego. Braki i błędy nie są traktowane jako zera. Przy temperaturze jest liczba próbek i zakres; przy pozostałych wartościach liczba próbek. Rozwijana lista pokazuje źródła, odległości i statusy. Kategorie indeksu powietrza nie są uśredniane.

Jeśli wyszukiwanie okolicy nie powiedzie się, aplikacja sprawdzi wybrany punkt i wyświetli informację, że pozostałych nie zbadano. Agregacja nie gwarantuje odczytów, gdy żaden punkt nie ma dostępnych danych.

## Dostęp do pomiarów

Pomiary pochodzą z żądania POST używanego przez stronę paczkomatu. To nieudokumentowany interfejs strony InPost, a nie oficjalne API pogodowe. Zwykły klient HTTP i Chromium otrzymywały HTTP 403 / Cloudflare. Dokładny klient `curl_cffi` używany przez InPost Air uzyskał dla TOR75M HTTP 404 i JSON `Air sensors are not available.` To oznacza brak udostępnionych odczytów tego punktu w chwili testu; nie przesądza o fizycznej obecności ani sprawności czujników.

Aplikacja rozróżnia odmowę dostępu (403/429), brak danych i błąd połączenia. Przy niedostępności wyświetla jeden komunikat zamiast pustych tabel. Nie pokazuje zmyślonych wartości ani temperatury z innego źródła. InPost nie podaje czasu pomiaru — wyświetlany czas oznacza pobranie danych.

Aplikacja używa klienta Node.js `impit` z anonimową sesją cookies i nagłówkami strony. Bez logowania i tokenu API. To odpowiednik mechanizmu aktualnej integracji InPost Air; nie daje gwarancji usunięcia blokady dla każdego IP. Wybór paczkomatu i promienia jest zapamiętywany. Ostatnie udane pomiary są dostępne offline po pierwszym otwarciu online. Odświeżanie co 5 minut podczas używania aplikacji. Cache serwera: 5 minut dla pomiarów, 30 sekund dla nieudanych odczytów.

Wyniki sprawdzenia 403 i źródła: [docs/inpost-403.md](docs/inpost-403.md).

## Vercel i instalacja

Zaimportuj repozytorium w Vercel: framework **SvelteKit**, Node.js **24.x**, instalacja `npm ci`, build `npm run build`, domyślny Output Directory. Adapter Vercel jest skonfigurowany. Buduj ze źródeł na Vercel, aby npm zainstalował właściwy binarny wariant `impit` dla Linux — lokalny build z macOS zawiera bibliotekę dla macOS. Bez zmiennych środowiskowych i bazy danych.

Alternatywnie, po zalogowaniu do swojego konta:

```sh
npx vercel --prod
```

Projekt nie został opublikowany na koncie Vercel. Działanie odczytów z adresów IP Vercel wymaga osobnego sprawdzenia; wdrożenie nie gwarantuje usunięcia blokady InPost.

Lokalny podgląd produkcyjny z service workerem:

```sh
npm run build
npm run preview
```

PWA wymaga HTTPS lub localhost. Instalacja: iPhone/Safari → Udostępnij → Do ekranu głównego; Android/Chrome → menu ⋮ → Dodaj do ekranu głównego.

## Sprawdzenie

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

Testy przeglądarkowe sprawdzają odczyty, agregację i zmianę promienia, pojedynczy komunikat błędu, wybór paczkomatu i offline na telefonie i komputerze. Test odczytu rzeczywistej dostępności InPost wymaga internetu; pozostałe używają danych testowych. Na nowym komputerze: `npx playwright install chromium`.

Ikony: `npm run icons` (źródło: `static/icon.svg`). Niezależny projekt, nie jest oficjalną aplikacją InPost.
