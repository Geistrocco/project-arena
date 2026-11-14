# Prehľad administrácie turnaja

Organizátor vidí nad rozpisom stavový panel s odporúčaným ďalším krokom a reálnou obsadenosťou. Panel používa existujúci oprávnený `get_tournament_draw_context`: prijaté a ručne zadané tímy sa deduplikujú rovnako ako pri potvrdení rozlosovania. Čakajúce prihlášky nezaberajú miesta. Počet položiek v skupinách sa preto označuje ako „Miesta v rozpise“, nie ako počet potvrdených tímov.

Panel rozlišuje:

- neúplné obsadenie — doplnenie tímov;
- čakajúce prihlášky — otvorenie rozhodnutí;
- úplné obsadenie so správnym počtom miest — náhľad rozlosovania;
- potvrdených účastníkov — otvorenie rozpisu;
- zapísané výsledky — pokračovanie v zadávaní;
- dokončené zápasy — kontrolu a potvrdenie výsledkov;
- uzamknuté výsledky — verejné výsledky;
- zrušený turnaj, uplynutý termín bez rozpisu alebo nesúlad kapacity — zodpovedajúcu kontrolu nastavení.

Panel nič neschvaľuje, nemení účastníkov, nelosuje ani nezamyká. Všetky existujúce potvrdenia a databázové ochrany zostávajú. Pri zlyhaní načítania sa ukáže chyba namiesto falošnej nulovej obsadenosti alebo odporúčania losovať.

Čakajúce prihlášky sú v organizátorovom zozname pred vybavenými. Verejný pohľad ich nezoraďuje inak a nezverejňuje kontakty. Kontext prihlášok je memoizovaný iba v rámci jedného serverového renderovania, aby ho panel a zoznam nenačítavali dvakrát. Poverený zapisovateľ výsledkov nevidí panel účastníkov ani ovládanie organizátora.

Rýchla navigácia vedie na prihlášky, náhľad rozlosovania, zápasy a poverené osoby. Kotvy rešpektujú výšku navigácie; dopĺňanie pozvaných tímov otvorí priamo príslušnú sekciu formulára. Po zapísaní prvého výsledku sa prípravná výzva na nové rozlosovanie neponúka.

Overenie: `test-tournament-workflow.cjs` pokrýva jednotlivé stavy, chybu načítania, skutočné počty a hranicu práv organizátora/zapisovateľa; regresie prihlášok overujú prednosť čakajúcich a ochranu kontaktov; existujúce databázové testy rozlosovania overujú nemennosť výsledkov a potvrdenia. Ďalej `pnpm check` a produkčný build. Testy nemenia skutočné turnaje.
