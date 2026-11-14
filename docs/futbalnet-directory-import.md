# Adresár Futbalnetu a skutočné družstvá

Import vyžiadaný 14. 11. 2026 používa verejné API, ktoré používa aj Futbalnet. Nekopíruje osoby, kontakty, súpisky, zápasy ani výsledky.

## Zdroje a rozsah

- Adresár SFZ: `https://api.sportnet.online/v1/ppo/futbalsfz.sk/related-ppos?ppoType=club`
- Definície klubových družstiev: `https://sutaze.api.sportnet.online/api/v2/public/{club}/teams?seasonName=2026%2F2027`
- Kontrolný zoznam súťaží sezóny: `https://sutaze.api.sportnet.online/api/v2/competitions?seasonName=2026%2F2027`
- Verejná dokumentácia: `https://sutaze.api.sportnet.online/api/v2/openapi.json`

Klubový adresár obsahuje 3 084 identít: 1 560 aktívnych a 1 524 neaktívnych, vyradených alebo s neurčeným stavom. Tournio zachováva stav už existujúcich klubov; nové neaktívne/vyradené identity nevystavuje ako aktívne. Pri 120 existujúcich kluboch zostali pôvodné interné ID, mená, mestá a ostatné ručné údaje; ďalší vlastný klub nebol menený. Pri chýbajúcom meste sa žiadne mesto neodhaduje.

Aktuálne družstvá sa overujú priamo na profile všetkých aktívnych klubov a existujúcich priradených klubov (1 562 profilov) pre sezónu **2026/2027**, ktorá sa v Tournio zobrazuje ako **2026/27**. Import sa krížovo porovnáva s 402 súťažami tejto sezóny. Niektoré vytvorené družstvá ešte nie sú prihlásené do súťaže; preto samotný zoznam súťaží nestačí. Výbery zväzov a univerzitné družstvá bez klubovej identity SFZ sa nevytvárajú ako futbalové kluby.

Výsledok úplnej kontroly: **5 715 odlíšených družstiev/kategórií v 1 388 kluboch**. Profily vrátili 5 731 registračných záznamov; rovnaké družstvá boli zjednotené. Pri 174 preverovaných kluboch zdroj pre túto sezónu nevrátil družstvá; žiadne kategórie sa im neodhadovali. Všetkých 1 562 profilov sa načítalo bez chýb.

## Identity a kategórie

`data/futbalnet-club-aliases.json` obsahuje manuálne preverené priradenia staršieho výberu k oficiálnym identitám. Ďalšie zhody vychádzajú zo stabilného ID alebo jednoznačného normalizovaného názvu; fuzzy zhody sa automaticky nezlučujú. Nové kluby používajú interné ID s prefixom `sportnet:`. Opakovaný import používa kanonický `source_id`.

Družstvá sa rozlišujú podľa klubu, sezóny, veku, pohlavia a skupiny A/B/C/D. Rovnaké družstvo prihlásené do viacerých súťaží sa nevytvára druhýkrát. `U09` sa zobrazuje ako `U9`; hlavné chlapčenské družstvo A má základnú kategóriu `U12`, ďalšie napríklad `U12 B`, dievčenské `U15 dievčatá` a dospelí `Muži`/`Ženy`. Názvy nových družstiev výslovne uvádzajú A/B a chlapcov/dievčatá.

Senec má v zdroji 16 družstiev: muži A, U19 A, U17 A, U15 A/B, U14 A, U13 A/B, U12 A, U11 A/B, U10 A, U9 A, U8 A/B a dievčatá U15 A. Existujúci Senec U12 zostal pod svojím pôvodným ID.

Import nemení trénerov, rodičov, hráčov, dochádzku ani prístupové práva. Pri kolízii `(club_id, category, season)` doplní iba pôvod údajov a zachová ID, názov a existujúci stav. Nič nevymazáva a neaktivuje nasilu predtým deaktivované družstvá. Zdrojové identity družstiev používajú stabilný kľúč klubu, sezóny, veku, pohlavia a skupiny; pôvodné registračné ID z rôznych súťaží zostávajú v prípravnom pláne. Odkaz na zdroj vedie na presný verejný profil družstva so sezónou.

## Načítanie veľkého adresára

Adresár klubov sa načítava po 500 riadkoch v stabilnom poradí podľa ID a až potom sa triedi pre zobrazenie. Pôvodný limit 1 000 klubov je odstránený. Trénerovo vyhľadávanie kategórií používa rovnaké databázové vyhľadávanie ako rodič; nefiltruje prvých 1 000 stiahnutých tímov. Účet si na zobrazenie vlastných tímov/pozvánok načíta konkrétne súvisiace ID.

## Opakovanie a overenie

1. `fetch-futbalnet-clubs.py` stiahne iba potrebné verejné polia; koniec stránkovania určí aj podľa kratšej stránky. Zdroj vracia `next_offset` aj po poslednej stránke a priebežný `total` nie je počet celého adresára.
2. `prepare-futbalnet-clubs.py` pripraví jednoznačné identity oproti exportu aktuálneho adresára. Nejednoznačné zhody vyžadujú kontrolu.
3. `fetch-futbalnet-teams.py` uloží overenú sezónu každého klubu do obnoviteľnej cache. Pri chybách ich vypíše a skončí s chybovým stavom; neoznačí import za úplný.
4. `prepare-futbalnet-teams.py` vytvorí odlíšené družstvá a overí dĺžky/naturálne kľúče.
5. Dátové zápisy prebiehajú po dávkach s `ON CONFLICT`, nie mazaním adresára. `futbalnet-team-import.sql` je šablóna pre overený JSON; oddeľovač nesmie byť v dátach.

Kontroly: `pnpm check`, produkčný build, `test-club-directory.cjs`, `test-futbalnet-import.cjs`, `test-futbalnet-preparation.py`, interakčné testy živého vyhľadávania a regresie režimov účtu a rodinných pozvánok. Test importu overuje opakovanie bez duplicít aj zachovanie pôvodného ID, väzieb hráčov/trénerov a neaktívneho stavu.
