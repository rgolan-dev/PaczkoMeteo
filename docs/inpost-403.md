# Sprawdzenie błędu InPost 403 — 27 października 2026

## Wynik

Początkowo zaobserwowana odpowiedź pomiarów TOR75M to HTML Cloudflare „Sorry, you have been blocked”, HTTP 403. Nie jest to komunikat JSON o brakującym tokenie aplikacji. Nie znaleziono dowodu, że interfejs pomiarowy używany przez publiczną stronę wymaga konta InPost lub klucza API.

Dokładna reguła WAF, reputacja IP lub inny warunek blokady pozostają nieznane bez logów właściciela serwisu. Sam błąd nie dowodzi braku czujników ani ich awarii. Nie potwierdzono jeszcze zachowania w zwykłej przeglądarce użytkownika ani po wdrożeniu na Vercel.

**Dalszy test dokładnym klientem `curl_cffi`, z profilem Chrome, pobraniem strony i tą samą anonimową sesją, dotarł do aplikacji InPost: HTTP 404, `application/json`, `{"message":"Air sensors are not available."}`.** TOR75M nie udostępniał wtedy odczytów. Są to dwie osobne warstwy: blokada Cloudflare przy zwykłych żądaniach oraz brak danych punktu po uzyskaniu odpowiedzi aplikacji.

## Sprawdzone lokalnie

- Strona TOR75M: HTTP 200; nadal zawiera `data-shipx-url="/shipx-point-data/51533/TOR75M/air_index_level"`.
- Publiczny ShipX Points: działające dane lokalizacji; nie dostarcza kompletu surowych odczytów czujników.
- POST odczytów: 403 + HTML Cloudflare.
- Pobranie strony, cookies sesji i nagłówki X-Requested-With, Origin, Referer: nadal 403.
- Oficjalna strona w normalnym Chromium: jej własny POST pomiarów również 403.
- Tymczasowy test klienta Node.js `impit` z profilem Chrome i nagłówkami strony: nadal 403. Następny test z cookies natrafił na problemy połączenia. W aplikacji dodano `impit` z `tough-cookie`; skuteczność z IP Vercel wymaga weryfikacji.

## Źródła i rozróżnienie autoryzacji

1. [Zgłoszenie InPost Air #130](https://github.com/CyberDeer/InPost-Air/issues/130) początkowo sugeruje autoryzację, ale dotyczy innego adresu: `api.inpost.pl/v1/points/...`. Autor integracji wyjaśnia w komentarzu, że nie korzysta z tego endpointu. Nie można przenosić tej diagnozy na pomiary strony.
2. [Zgłoszenie #133](https://github.com/CyberDeer/InPost-Air/issues/133) dotyczy właściwego `inpost.pl/shipx-point-data/.../air_index_level` i błędu 403. Użytkownicy potwierdzili rozwiązanie po aktualizacji do 1.8.2.
3. [Poprawka z 8 października](https://github.com/CyberDeer/InPost-Air/commit/198cf06e0016b8bdc92d5acd7fa683d7e76bec53) zmienia klienta HTTP na `curl_cffi`, dodaje profil przeglądarki, początkowe pobranie strony i nagłówki. Nie dodaje konta użytkownika ani tokenu OAuth. To dowód kierunku naprawy, nie gwarancja działania dla każdego IP i paczkomatu.
4. [Aktualny kod integracji](https://github.com/CyberDeer/InPost-Air/blob/master/custom_components/inpost_air/api.py).
5. [Cloudflare: Error 403](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-403/) opisuje blokady WAF, ustawienia ochrony i kontrole przeglądarki. Sama odpowiedź nie ujawnia konkretnej reguły.
6. [Dokumentacja InPost Global APIs](https://developers.inpost-group.com/) opisuje OAuth2.1 dla oficjalnego API. Nie znaleziono w niej potwierdzenia, że taki token udostępnia odczyty pogodowe tej strony.

## Punkty w okolicy

ShipX Points zwrócił 8 najbliższych punktów w promieniu 3 km: TOR75M, TOR23M (547 m), TOR16N (571 m), TOR30M (573 m), TOR47M (673 m), TOR19N (678 m), TOR02BAPP (685 m), TOR15M (695 m). TOR02BAPP ma w katalogu `air_index_level: GOOD`. To metadana katalogu, nie potwierdzony świeży komplet surowych odczytów. Dalsze testy sąsiadów natrafiły na przejściowe błędy DNS.

Dodana agregacja sprawdza do 8 najbliższych punktów, bierze medianę każdego parametru i zachowuje źródła. Nie uśrednia kategorii indeksu i nie zastępuje braków zerami.

Wyszukiwanie odległości: [oficjalna dokumentacja Points](https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153493/Points%2BParcel%2BLocker%2BParcelPoint).

## Co rozstrzygnie pozostałą niepewność

Sprawdzenie liczb na oficjalnej stronie z połączenia użytkownika pozwoli odróżnić problem naszego połączenia od szerszej niedostępności. Właściciel serwisu może wskazać konkretną regułę, korzystając z czasu zapytania i identyfikatora Cloudflare Ray ID. Autoryzowanego, udokumentowanego API odczytów pogodowych nie ustalono.

## Końcowa weryfikacja aplikacji

Kontrola typów, build, 6 testów jednostkowych i 12 testów przeglądarkowych przeszły. Testy obliczeń i interfejsu używają jawnych danych testowych. Końcowy rzeczywisty odczyt agregacji natrafił na problem pobrania listy sąsiadów; zgodnie z obsługą błędu sprawdzono tylko TOR75M, bez uzyskanych pomiarów. Nie potwierdzono jeszcze działających surowych odczytów sąsiadów.

## Test wdrożenia Vercel i poprawka transportu

Publiczne wdrożenie `paczko-meteo.vercel.app` zwracało poprawną listę 8 punktów, ale każdy odczyt kończył się 403 już na otwarciu strony. Odpowiedź aplikacji miała HTTP 200; 403 pochodziły z InPost. To potwierdza działanie modułu Node i problem dostępu upstream, bez dowodu na konkretną regułę WAF lub blokadę zakresu IP.

Porównanie lokalne: `curl_cffi==0.13.0` ponownie otrzymał stronę TOR75M z HTTP 200, a następnie JSON pomiarów z HTTP 404. Wymiana klienta Node na rzeczywisty `curl_cffi` jest uzasadniona tym porównaniem. Funkcja `api/inpost.py` zachowuje sesję cookies, używa POST oraz sprawdza angielską stronę, gdy polska nie ma interfejsu pomiarowego. Nie korzysta z kont, tokenów użytkowników, solverów CAPTCHA ani rotacji proxy.

Funkcja przyjmuje do 8 kodów i adresów oficjalnych stron InPost. Walidacja odrzuca inne domeny, porty i ścieżki. Równocześnie wykonywane są maksymalnie 3 odczyty, z limitem czasu całej partii. Nie jest to otwarty serwer proxy.

Agregacja pozostaje w SvelteKit na `/weather`. Zakres `/api/*` jest przeznaczony dla Pythona zgodnie z [dokumentacją adaptera SvelteKit](https://svelte.dev/docs/kit/adapter-vercel#Notes-Vercel-functions). [Vercel obsługuje funkcje Python](https://vercel.com/docs/functions/runtimes/python); wymagania są w `requirements.txt`. Region Frankfurt ogranicza odległość od źródła danych, ale sam w sobie nie gwarantuje usunięcia 403.
