# Viditeľné žiadosti hráčov a jednotné oprávnenia

Zistená chyba: prehľad tímu odvodzoval prístup iba z `team_memberships`, kým kalendár a správa nominácií rešpektujú aj `user_roles` owner/admin. Vlastník, ktorý bol zároveň rodičom hráča, preto videl v prehľade „Rodičovský prístup“, hoci mohol pridávať tréningy. Rodinný prehľad tiež vynechával administrátorove oprávnené čakajúce žiadosti. Bežný tréner žiadosť videl, ale až nízko pod kartami.

Oprava:

- `getMyTeams` načíta dôveryhodnú rolu z `user_roles` a označí owner/admin ako administrátora platformy aj v tímoch jeho detí. Príslušnosť vlastných detí zostáva zachovaná. Tento zoznam sa nerozšíri o celý adresár importovaných tímov.
- Prehľad žiadostí používa existujúce `private.join_team_staff`, rovnaké oprávnenie ako správa tímu. Tréner môže byť zároveň rodičom. Samotná preferencia účtu „tréner“ nepridáva oprávnenia.
- Pri názve tímu je výrazné upozornenie s počtom žiadostí a odkazom na konkrétny tím. Upozornenie sa zobrazí aj v účte a zozname tímov.
- Pod hlavnou navigáciou je kompaktné upozornenie po prihlásení, na mobile aj počítači. Obnovuje sa pri návrate na kartu, po rozhodnutí a každých 30 sekúnd na viditeľnej karte. Po zmene účtu alebo odhlásení sa predchádzajúci počet okamžite skryje; oneskorené odpovede ho neobnovia.
- `/ziadosti-hracov` poskytuje samostatný prehľad, filter tímov a stránkovanie po 50 položkách. Počet sa počíta nad celým oprávneným zoznamom, nie iba prvými 100 položkami rodinného kontextu.

Nové RPC overujú prihlásený účet a potvrdený e-mail, majú prázdny search_path a sú dostupné iba authenticated. Neotvárajú priame čítanie tabuliek. Členstvo v tíme alebo existujúce administrátorské oprávnenie je podmienkou každého záznamu. Upozornenie v hlavičke načítava iba počty a názvy tímov, nie údaje detí. Obyčajný rodič nevidí žiadosti cudzích detí.

Overenie: PGlite autorizačné testy (rodič, iný tréner, tréner-rodič, owner/admin, 105 žiadostí a 3 strany), test oprávnení a označenia v prehľade tímu, interakčné testy upozornenia pri zmene účtov a oneskorených odpovediach, regresie rodinných pozvánok/režimov účtu, pnpm check a produkčný build. Pri overovaní sa žiadna skutočná žiadosť neschvaľuje.

## Ďalší prerokovaný návrh

Prechod sezóny má ponúknuť napr. U12 → U13 s ručnou opravou cieľového družstva/kategórie a potvrdením trénera. Staré sezónne zaradenie a dochádzka sa majú zachovať. Táto zmena zatiaľ nie je implementovaná.
