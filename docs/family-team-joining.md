# Prijímanie hráčov do tímu

Rodič aj tréner môžu spravovať vlastné deti. Zaradenie hráča nikdy nepridáva rodičovi oprávnenie trénera a nepridáva jeho ďalšie deti.

## Pozvanie trénerom

- Existujúce e-mailové pozvanie je viazané na overený e-mail príjemcu. V účte rodič vyberie konkrétne vlastné dieťa a potvrdí kategóriu a sezónu.
- Na účte aj v tímovom prehľade tréner môže vytvoriť jednorazový odkaz na 14 dní. Môže ho skopírovať, otvoriť WhatsApp alebo zdieľanie telefónu. Aplikácia automaticky neposiela SMS ani WhatsApp a neukladá telefón príjemcu.
- Odkaz je prenosné oprávnenie prijať jedno vlastné dieťa do určeného tímu. Tréner ho posiela konkrétnemu rodičovi. Pre druhé dieťa vytvorí ďalší odkaz.
- Pri otvorení anonymný návštevník vidí iba tím, kategóriu, sezónu a platnosť. Po registrácii, overení e-mailu alebo prihlásení sa vráti na pozvánku. Vyberie existujúci profil alebo vytvorí chýbajúci a osobitne potvrdí prijatie.
- Použitý odkaz zobrazí výsledok iba príjemcovi, ktorý je stále opatrovníkom vybraného dieťaťa. Ostatní vidia neplatnú pozvánku.
- Odvolanie trénera z tímu zneplatní jeho nepoužité pozvánky. Aktuálny správca tímu môže odkaz zrušiť.

## Žiadosť rodiča

Na `/pripojit-sa` rodič vyhľadá aktívny klub alebo mesto a vyberie konkrétne dieťa, kategóriu a sezónu. Žiadosť neudeľuje prístup do tímu. Aktuálny tréner vidí meno, ročník, e-mail žiadateľa a poznámku. Schváli prijatie alebo uvedie dôvod zamietnutia. Rodič vidí stav a môže zrušiť vlastnú čakajúcu žiadosť. Pri tíme bez správcu je výslovne uvedené, že čaká na trénera.

Schválenie a prijatie pozvánky opätovne overia aktívny tím, profil aj aktuálne opatrovníctvo. Existujúce neaktívne členstvo sa obnoví. Prijatie pozvánky zároveň vybaví čakajúcu žiadosť rovnakého dieťaťa do rovnakého tímu. Databázové zámky a jedinečný index chránia pred opakovaným spracovaním.

## Profily a bezpečnosť

Vytvorenie profilu nezaraďuje dieťa do tímu. Rovnaké meno a rovnaký alebo chýbajúci dátum narodenia v jednej rodine vyvolajú upozornenie namiesto vytvorenia duplicity. Ak profil spravuje druhý rodič, treba použiť existujúce rodinné pozvanie; automatické zlučovanie medzi rodinami neprebieha.

Nové tabuľky majú RLS a nemajú priame oprávnenia pre `anon` ani `authenticated`. Prístup zabezpečujú overované RPC. V databáze sa ukladá iba SHA-256 odtlačok náhodného 256-bitového tokenu. Surový odkaz sa zobrazí iba po vytvorení. Stránka pozvánky má zákaz indexovania, no-referrer a private/no-store. Návratové adresy autentifikácie používajú úzky zoznam povolených ciest.

## Overenie a nasadenie

- `pnpm check`
- `pnpm build` s nakonfigurovanými verejnými Supabase premennými
- `NODE_PATH=../test-tools/node_modules node scripts/test-family-team-joining.cjs` (samostatne nainštalovaný `@electric-sql/pglite`)
- `node scripts/test-family-team-joining-ui.cjs`
- `node scripts/test-account-modes.cjs`
- `node scripts/test-auth-errors.cjs`

Migráciu `20261114152945_family_team_joining.sql` nasadiť spolu s aplikáciou po schválení zlúčenia. Lokálne testy neposielajú skutočné pozvánky a nemenia produkčné dáta.
