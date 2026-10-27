# PaczkoMeteo — rozwój pogodynki

Cel: rano w kilkanaście sekund wiedzieć, co założyć, co zabrać i czy pogoda zmieni się przed powrotem. Widok główny ma pomagać podjąć decyzję. Bez reklamowych nagłówków, pustych kafelków i błędów HTTP.

## 1. Baza — wdrożone

- Czytelny ekran telefonu: lokalna temperatura, propozycja ubioru, kolejne godziny, powietrze i trzy dni prognozy.
- Pomiary InPost oddzielone od modelowej prognozy Open-Meteo. Brakujące odczyty czujnika nie są zastępowane prognozą.
- Domyślne 5 km i wyszukiwanie czujników w całym obszarze zamiast sprawdzania tylko 8 najbliższych paczkomatów. Mediany z dostępnych czujników; szczegóły i wybór promienia w rozwijanej sekcji.
- Podpowiedź ubioru według najchłodniejszej temperatury odczuwalnej w najbliższych 12 h, różnicy temperatur, opadów i wiatru. Podany horyzont i zakres temperatur pozwalają ocenić propozycję.
- Zapis danych i instalacja PWA. Zapisane lub nieaktualne prognozy mają oznaczenie; nie generują propozycji ubioru.
- Klawiatura, etykiety dostępności, stany ładowania i brak pustych parametrów jakości powietrza.

Odbiór: na szerokości 320 px nie ma poziomego przewijania, braki jednego źródła nie blokują drugiego, a użytkownik widzi źródło i aktualność danych.

## 2. Następne: wyjście i powrót — najwyższy priorytet

**Dlaczego:** minimum z 12 h jest sensownym początkiem, ale nie rozróżnia spaceru na kwadrans i całego dnia poza domem.

- Godzina wyjścia i powrotu zapamiętana na telefonie; osobny plan na dziś i jutro rano.
- Dwie krótkie informacje: „Rano 6°, odczuwalna 3°” i „Powrót 15°, możliwe opady”.
- Porada dla konkretnego przedziału oraz opcja „wychodzę teraz na godzinę”.
- Pierwsza godzina zwiększonej szansy opadów i maksymalne porywy w wybranym oknie.
- Konkretny zestaw rzeczy do zabrania: warstwa na powrót, kaptur/parasol, odpowiednie buty.

Odbiór: chłodny poranek i ciepłe popołudnie prowadzą do warstw, opad po powrocie nie powoduje zalecenia parasola, nocna temperatura nie wpływa na krótkie wyjście w południe. Wszystkie godziny uwzględniają zmianę czasu w Polsce.

## 3. Personalizacja ubioru

- Preferencja „łatwo marznę / neutralnie / łatwo mi gorąco”, z jawnym wpływem na propozycję.
- Tryb dojścia: spacer, rower, samochód; czas spędzany na zewnątrz.
- Proste „za zimno / w sam raz / za ciepło” do dopasowania kolejnych podpowiedzi lokalnie, bez konta.
- Opcjonalna lista własnych ubrań: cienka kurtka, płaszcz, softshell; aplikacja proponuje rzeczy, które rzeczywiście masz.

Odbiór: ustawienia są opcjonalne, działają bez logowania, można je wyzerować i od razu zobaczyć, dlaczego zmieniła się rada.

## 4. Większa pewność danych

- Wybór punktu z listy/mapy zamiast znajomości kodu; ulubione lokalizacje: dom i praca.
- Możliwość wyboru punktu z dostępnym czujnikiem bez ręcznego sprawdzania paczkomatów.
- Historia rzeczywistych pomiarów i trend temperatury/powietrza, dopiero po zapewnieniu trwałego magazynu danych. Obecne API nie gwarantuje historii.
- Czytelna ocena jakości powietrza przy agregacji, po wyborze i udokumentowaniu właściwego indeksu. Nie uśredniać nazw kategorii ani tworzyć przypadkowych progów.
- Podgląd różnic między lokalnym pomiarem i prognozą, bez ukrywania źródeł i przedziałów pomiaru.

Odbiór: liczba punktów jest podawana osobno dla parametru, stare odczyty są rozpoznawalne, a ekran nie sugeruje dokładności większej niż źródła.

## 5. Planowanie i powiadomienia

- Zwięzłe siedem dni prognozy; UV i długość dnia w szczegółach, bez przeładowania pierwszego ekranu.
- Oficjalne ostrzeżenia pogodowe dla lokalizacji po sprawdzeniu źródła, licencji i aktualności API.
- Opcjonalny poranny komunikat o wybranej godzinie: ubiór, parasol, powrót.
- Web Push dopiero po przygotowaniu zgód, subskrypcji, magazynu danych i harmonogramu. Sama PWA nie gwarantuje zadań w tle; na iOS sprawdzić wymagania instalacji i aktualne wsparcie.

Odbiór: żadnych niezamówionych powiadomień; można wybrać dni i godzinę, wyłączyć je jednym ruchem. Powiadomienie nie może zawierać rady z nieaktualnych danych.

## Zasady projektu

1. Najpierw decyzja o wyjściu i ubraniu, potem liczby i szczegóły.
2. Pomiary i prognoza zawsze mają podpisane źródła.
3. Brak danych to uczciwy krótki komunikat; zero to prawdziwa wartość, nie zastępstwo braku.
4. Każda funkcja ma działać na telefonie i nie pogarszać czytelności głównego ekranu.
5. GitHub + Vercel pozostają podstawą. Baza danych i powiadomienia wymagają osobnej decyzji architektonicznej; bez dodatkowego VPS.

## Źródło prognozy

[Open-Meteo — dokumentacja](https://open-meteo.com/en/docs): temperatura odczuwalna, prawdopodobieństwo i ilość opadów, wiatr/porywy, godzinowe i dzienne dane, kody WMO. Czas przekazujemy jako Unix UTC i prezentujemy w Europe/Warsaw. Opady godzinowe odnoszą się do poprzedzającej godziny; prawdopodobieństwo nie jest gwarancją opadu. Obecna podpowiedź jest heurystyką ubioru, nie spersonalizowanym modelem komfortu.
