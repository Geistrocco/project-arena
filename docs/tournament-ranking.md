# Poradie tímov pri rovnosti bodov

Nový turnaj predvolene používa body, minitabuľku vzájomných zápasov (body, rozdiel skóre, strelené góly), celkový rozdiel skóre a celkové strelené góly. Organizátor môže pred prvým výsledkom zvoliť celkové skóre pred minitabuľkou. Bodovanie zostáva 3 za výhru a 1 za remízu.

Minitabuľka vždy zahŕňa všetky tímy s rovnakým celkovým počtom bodov. Po čiastočnom rozdelení sa pre menšiu podskupinu nepočíta znova. Úplná zhoda má spoločné priebežné miesto a označenie „nerozhodnuté“. Názov tímu nerozhoduje o postupe.

Po dohraní celej skupiny môže organizátor usporiadať iba úplne zhodné tímy, uviesť verejný dôvod (napríklad žreb podľa pravidiel turnaja) a potvrdiť rozhodnutie. Databáza overuje oprávnenie, úplnosť výsledkov, aktuálnosť tabuľky aj zachovanie ostatných miest. Rozhodnutie a dôvod sa zobrazujú v tabuľke a PDF. Zmena výsledkov alebo obsadenia skupiny rozhodnutie zneplatní.

Nerozhodnutého postupujúceho nemožno použiť na zadanie výsledku nadväzujúceho zápasu. S nerozhodnutými miestami nemožno uzamknúť konečné výsledky turnaja. Keď už nadväzujúci zápas má výsledok, rozhodnutie ani výsledky zdrojovej skupiny sa nedajú meniť; oprava takýchto nadväzností potrebuje samostatný postup, ktorý táto zmena nepridáva.

Pravidlá sa uzamknú pri prvom výsledku a zostanú uzamknuté aj po vymazaní výsledkov. Existujúce turnaje majú režim `legacy`, ktorý zachováva pôvodné poradie vrátane názvu tímu. Opakovanie staršieho turnaja predvolene použije nové pravidlá. Migráciu `20261114065403_tournament_tie_breaks.sql` treba nasadiť pred aplikáciou.

Overenie: `NODE_PATH=../test-tools/node_modules node scripts/test-tournament-tie-breaks.cjs` (PGlite), `node scripts/test-tournament-tie-breaks-ui.cjs`, `node scripts/test-results-pdf.cjs`, `pnpm check`, `pnpm build`.
