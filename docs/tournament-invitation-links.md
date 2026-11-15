# Turnajové pozvánky cez odkaz

Organizátor v administrácii pripraví odkaz pre konkrétny záznam družstva (kategória, sezóna, A/B), skopíruje pripravený text a sám ho pošle trénerovi cez WhatsApp alebo e-mail. Aplikácia neposiela správy. Vlastné názvy tímov a staršie výbery celého klubu nemajú overiteľné družstvo, preto vyžadujú najprv výber konkrétnej kategórie.

Odkaz obsahuje náhodný 256-bitový token; v databáze je iba SHA-256 odtlačok. Platnosť je najviac 30 dní alebo do konca dňa turnaja (Bratislava). Nový odkaz zneplatní starý, odpovede sa zachovajú. Odkaz možno zneplatniť. Tokenová stránka nemá indexovanie, cache ani referrer na ďalšie weby.

## Odpovede

- Oprávnený tréner/manager/klubový admin družstva potvrdí alebo odmietne účasť priamo.
- Ostatní prihlásení s potvrdeným e-mailom odošlú odpoveď na overenie organizátorom. Organizátor vidí meno, overený e-mail účtu, telefón, poznámku a požadovanú odpoveď. Až po kontrole kontaktu a zastupovania schváli odpoveď.
- Zamietnutie zastupovania ponechá pozvánku otvorenú pre skutočného trénera. Jeden náhodný držiteľ odkazu nesmie obsadiť možnosť odpovedať oprávnenému trénerovi.
- Schválenie neudeľuje členstvo v tíme, prístup k súpiske, ani prístup do celej beta aplikácie. Je platné iba pre odpoveď na danú turnajovú pozvánku.

Stavy organizátora: odkaz nepripravený, čaká na odpoveď, čaká na overenie zastupovania, účasť potvrdená, odmietnutá. Zrušené, uplynuté alebo odstránené pozvánky nevracajú podrobnosti.

## Uzavretá aplikácia

GET/HEAD tokenovej stránky a jej registrácie zostávajú dostupné aj verejnosti; bez platného tokenu sa údaje nezobrazia. Prihlásenie a overenie e-mailu zachovajú návrat na konkrétnu pozvánku. Registračná stránka vysvetľuje obmedzený prístup. Verejná registrácia a zvyšok aplikácie ostávajú uzavreté.

Data API hook má výnimku iba pre `get_tournament_invitation` a `respond_tournament_invitation`; každý RPC kontroluje token a pri odpovedi aj identitu, e-mail a pozastavenie účtu. Zoznam účtov beta testovania sa nemení. Ostatné RPC a tabuľky ostávajú pre externého trénera zablokované.

## Účastníci a rozpis

Konkrétne družstvo vybrané organizátorom ešte nie je potvrdený účastník. Pozvánky čakajúce na odpoveď rezervujú kapacitu, ale do potvrdeného rozlosovania vstupujú až po potvrdení/overení. Odmietnutie uvoľní rezerváciu. Staršie ručné názvy a prijaté verejné prihlášky sa zachovávajú. Formulár môže stále zobraziť predbežný rozpis so zvolenými názvami; finálne potvrdenie rozlosovania vychádza z potvrdených účastníkov.

Zmena stavu aktualizuje verziu turnaja, aby starý náhľad rozlosovania neprepísal nové odpovede. Odpovede ani overovanie nemenia zápasy alebo výsledky. Po uzavretí prihlasovania, prvom výsledku, uzamknutí alebo uplynutí termínu sa pozvánky nedajú meniť.

## Nasadenie

Pred zlúčením aplikovať `20261115144232_tournament_invitation_links.sql`. Migrácia nevytvára skutočné pozvánky ani nemení oprávnenia existujúcich používateľov. Rozširuje súkromný hook a upravuje potvrdených účastníkov a rezervácie. Pred deployom overiť testy a zachovanie uzavretého režimu.

Testy: `test-tournament-invitation-links.cjs` (SQL), `test-tournament-invitation-auth.cjs` (React a návratové routy), regresie `test-private-site-proxy.cjs`, `test-accepted-teams-draw.cjs`, `test-tournament-workflow.cjs`, `test-auth-errors.cjs`, lint/TypeScript a produkčný build. Pri testovaní sa nevytvárajú produkčné účty, neodosielajú pozvánky ani nemenia reálne odpovede.
