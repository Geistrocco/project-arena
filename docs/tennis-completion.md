# Dokončenie tenisu po PR60

Táto zmena prenáša tenisovú verziu z PR46 na aktuálny základ vrátane práv zapisovateľov, histórie, zámkov a rozhodovania o rovnosti. Nahrádza starý návrh rozhodovať úplnú zhodu podľa poradia vo formulári.

## Formáty a zadávanie

Dvojhra a pevné dvojice, každý s každým, skupiny + play-off, vyraďovací pavúk s voľným žrebom a útecha po prvej prehre. Útecha podporuje plný pavúk 4/8/16/32/64 účastníkov. Ostatné počty používajú bežný pavúk alebo skupiny. Časy nástupu sú orientačné a rozpis je jednodňový.

Bodovanie: jeden set do 6, krátky set do 4 alebo dva víťazné sety s tretím setom nahradeným match-tiebreakom do 10. No-Ad je deklarované pravidlo hrania, aplikácia nezapisuje jednotlivé výmeny. Tenisové pravidlá, disciplína a systém sú po prvom výsledku natrvalo uzamknuté. Mená hráčov/dvojíc zadáva organizátor; klubové prihlášky tímov sa pre tenis nepoužívajú.

## W.O., skreč a oprava

- W.O. má určeného víťaza, prázdne sety a žiadne vymyslené gemy. Nulové uložené súčty setov sa nezobrazujú ako remíza; o víťazovi rozhoduje samostatný údaj.
- Pri skreči sa zadajú dokončené sety a posledný rozohraný set. Do vyhraných setov sa počítajú iba dokončené sety; do gemov aj skutočne odohrané gemy rozohraného setu. Neodohrané sety ani gemy sa nedopĺňajú. Údaje match-tiebreaku nepatria do počtu gemov; dokončený match-tiebreak sa počíta ako rozhodujúci set.
- W.O. aj skreč dávajú jednu výhru označenému víťazovi, aj keď má menej vyhraných setov než skrečujúci súper.
- Rozhoduje iba organizátor s verejným dôvodom. Náhľad beží v podtransakcii s úplným rollbackom a ukazuje víťaza, skutočné skóre a poradie. Potvrdenie vyžaduje aktuálnu verziu výsledkov aj pravidiel.
- Rozhodnutie možno opraviť na dohraný zápas alebo vrátiť bezpečne obnoviteľný stav pred posledným rozhodnutím, aj späť na neodohraný zápas. Obnova sa odmietne, ak výsledok medzitým zmenil iný zápis.
- Opravy zdrojov už odohraných nadväzujúcich zápasov sa odmietnu. Zapisovateľ nemôže bežným formulárom prepísať W.O. ani skreč. Uzamknuté výsledky treba najskôr odomknúť s dôvodom.

Celkové odstúpenie hráča z celého turnaja sa touto zmenou nezavádza. Organizátor rieši jeho konkrétne neodohrané zápasy cez W.O.; nejde o futbalové hromadné kontumácie 3:0.

## Poradie a postupy

Výhry → pri presne dvoch účastníkoch s rovnakým počtom výhier vzájomný zápas → podiel vyhraných setov → podiel vyhraných gemov. Metriky používajú iba skutočné skóre. Úplná zhoda zostáva nerozhodnutá, kým organizátor neurčí poradie s verejným dôvodom podľa pravidiel konkrétneho turnaja. Ide o deklarované klubové pravidlo, nie univerzálne pravidlá všetkých tenisových súťaží.

Databáza je autoritatívna pre poradie aj postup. Tenisové aj futbalové výpočty sú oddelené. Už potvrdené futbalové rozhodnutia o rovnosti zachovávajú svoj pôvodný identifikátor verzie a zostávajú platné. Skupina s nerozhodnutým poradím blokuje postup a konečné uzamknutie; pomocná súpiska hráčov v čisto vyraďovacom pavúku nie je hodnotená ako skupinová tabuľka. Víťaz útechy sa v PDF neoznačuje ako tretí hlavného pavúka.

## Nasadenie a overenie

Aplikovať iba novú migráciu `20261114102350_tennis_completion.sql` po PR60. Obsahuje bootstrap tenisových stĺpcov a funkcií aj pre čistú databázu; nenúti opätovné nasadzovanie starých migrácií PR46, ktoré už v produkcii existujú pod historickými verziami. Starý PR46 bude nahradený týmto návrhom, nemá sa zlúčiť samostatne.

Overenie: `pnpm check`, `pnpm build`, `node scripts/test-tennis.cjs`, `NODE_PATH=../test-tools/node_modules node scripts/test-tennis-completion.cjs`, `node scripts/test-tennis-completion-ui.cjs`, regresie pravidiel poradia a kontumácií, `node scripts/test-results-pdf.cjs`. Nové PGlite testy pokrývajú čistý bootstrap, skreč, W.O., obnovu výsledku, zámky, postupy, oprávnenia, úplné zhody a zachovanie už potvrdených futbalových rozhodnutí. Prihlásený ručný test v produkcii nebol súčasťou implementácie.
