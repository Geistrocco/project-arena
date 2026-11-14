# Kontumácie a odstúpenie tímu

Organizátor nastaví pred prvým výsledkom alebo potvrdeným odstúpením:

- pravidlo odstúpenia `keep` (predvolené): odohrané výsledky zostávajú a zostávajúce zápasy tím prehrá kontumačne;
- alternatívu `annul`: všetky zápasy odstúpeného tímu v skupine sa vylúčia z tabuľky, vrátane už odohraných. Pôvodné skóre zostáva zachované v dátach a histórii;
- kontumačné skóre víťaza (1 až 999, predvolené 3), proti súperovej nule. Ide o nastavenie organizátora podľa pravidiel konkrétneho turnaja, nie o univerzálne športové pravidlo.

Tieto pravidlá sa uzamknú natrvalo, aj po vymazaní skóre alebo zrušení odstúpenia. Samostatná kontumácia, odstúpenie a ich opravy sú dostupné iba organizátorovi, nie poverenému zapisovateľovi.

## Náhľad a potvrdenie

Najskôr organizátor vyberie zápas alebo tím a uvedie verejný dôvod. Náhľad obsahuje pôvodné a nové skóre, anulované zápasy a tabuľky po zmene. Vykonáva tú istú databázovú operáciu v podtransakcii, ktorá sa celá vráti späť. Náhľad nezanechá výsledky, odstúpenie, históriu ani zámok pravidiel.

Potvrdenie znovu kontroluje vlastníka turnaja, zámok výsledkov a verziu všetkých výsledkov, obsadenia, rozhodnutí o poradí a pravidiel. Pri zmene medzi náhľadom a potvrdením treba vytvoriť nový náhľad. Operácia sa uloží celá alebo vôbec.

## Tabuľky a nadväzujúce zápasy

Kontumácia sa boduje rovnakým spôsobom ako výsledok zápasu. Anulovaný zápas má `outcome=void`, nezapočítava sa do žiadnej štatistiky ani minitabuľky a na stránke sa nikdy neprezentuje ako bodovaná remíza 0:0. Už odohrané skóre sa pri anulovaní nevymazáva.

Odstúpený tím zostáva v rozpise aj tabuľke, no je zoradený za aktívnymi tímami a nemá medailu. Minitabuľka aktívnych tímov nezahŕňa odstúpené tímy ako súperov s rovnakým počtom bodov.

Keď sa účastníci neskorších zápasov stanú známymi, kontumácie odstúpených tímov sa doplnia automaticky. Ak chýbajú obaja účastníci, zápas je anulovaný bez víťaza. Známa absencia sa prenesie do nasledujúceho kola, kde proti prítomnému tímu znamená voľný postup zapísaný ako kontumácia. Aj automatické rozhodnutia majú dôvod a záznam v histórii.

Opravy zdrojovej skupiny a zápasov sú blokované, ak už nadväzujúci zápas má výsledok. Odstúpenie sa tiež zablokuje, ak by zmenilo poradie skupiny s už odohranými nadväzujúcimi zápasmi. Po odstúpení nemožno regenerovať rozpis ani meniť obsadenie; tým sa chráni história rozhodnutia. Opravy komplikovaných odohraných nadväzností táto zmena nepridáva.

## Opravy

Samostatnú kontumáciu možno zrušiť s novým dôvodom a obnoviť výsledok alebo stav pred prvou kontumáciou. Bežný formulár výsledku nemôže prepísať kontumáciu ani anulovaný zápas.

Odstúpenie možno zrušiť iba pri jednom odstúpenom tíme a nezmenených výsledkoch dotknutých zápasov. Obnovia sa pôvodné stavy zápasov v opačnom poradí nadväzností. Ak nastali ďalšie ovplyvňujúce rozhodnutia, odmietne sa celá oprava.

Verejná stránka a PDF ukazujú dôvody, označenia výsledkov, odstúpené tímy a históriu zmien skóre. Interné snímky a identita autora nemajú priamy prístup cez Data API. Pravidlá a nastavené skóre sú zverejnené medzi pravidlami turnaja.

Tenis je zatiaľ zámerne blokovaný v paneli aj databázovej operácii. Jeho setové kontumácie patria k samostatnému dokončeniu tenisového bodovania (PR46).

## Nasadenie a overenie

Pred aplikáciou treba aplikovať migráciu `20261114091346_tournament_incidents.sql` po migrácii pravidiel poradia PR59. Nové stĺpce majú predvolené hodnoty a nemenia historické výsledky.

- `NODE_PATH=../test-tools/node_modules node scripts/test-tournament-incidents.cjs` – PGlite testy náhľadu, oprávnení, verzií, kontumácií, oboch pravidiel odstúpenia, obnovy, automatických postupov, zámkov a histórie;
- `node scripts/test-tournament-incidents-ui.cjs` – formuláre, oddelenie náhľadu a potvrdenia, verejný dôvod a ochrana výsledkov;
- existujúce testy rovnosti bodov a PDF, `pnpm check` a `pnpm build`.
