# Súkromné testovanie

Verejnosť vidí `/pripravujeme`. Prihlásenie a obnova hesla zostávajú dostupné. Prístup do aplikácie majú všetky účty existujúce v čase aplikovania migrácie `20261115090813_private_site_testing.sql`; neskoršie účty sa automaticky nepridávajú. Existujúce tímové a administrátorské oprávnenia sa nemenia.

Privátna tabuľka `private.site_testers` obsahuje iba UUID existujúcich účtov. Klienti ju nemôžu čítať ani meniť. `get_site_access()` vracia iba aktuálny stav režimu a prístup volajúceho používateľa. Pri zlyhaní kontroly zostáva web uzavretý.

Proxy chráni stránky, priame odkazy, PDF, API a POST/server actions; prihlasovacie a obnovovacie GET/HEAD routy ostávajú dostupné. Registrácia je v režime testovania neprístupná aj existujúcim testerom. Verejný layout nemá navigáciu k turnajom ani dátové notifikácie; prihlásenie nezobrazuje registračný odkaz. Odhlásenie načíta stránku nanovo a odstráni súkromný obsah z aktuálneho dokumentu.

Data API chráni `public.enforce_private_site`, zaregistrovaný ako `pgrst.db_pre_request` na role `authenticator`. Kontrola sa vykonáva pred tabuľkovými aj RPC/GraphQL požiadavkami, vrátane SECURITY DEFINER funkcií. Výnimkou je iba prístupový RPC a dôveryhodný service role. Auth služba ostáva dostupná na prihlásenie a obnovu hesla; účet vytvorený priamo cez Auth API nebude zaradený do povoleného zoznamu. V aplikácii sa momentálne nepoužíva Storage ani Realtime; hook chráni iba Data API. Pri budúcom použití týchto služieb treba rovnakú hranicu doplniť do ich RLS.

V uzavretom režime všetky odpovede webu používajú `private, no-store` a `X-Robots-Tag: noindex, nofollow, noarchive`. Robots zakazuje indexovanie a sitemap je prázdna. Nejde o bezpečnostnú bariéru; tú tvoria prístupové kontroly.

## Nasadenie a opätovné otvorenie

Migrácia vytvorí zoznam testerov a hook, ale necháva režim vypnutý. Najprv ju aplikovať a overiť počty účtov. Potom nasadiť nový kód. Až po úspešnom nasadení aktivovať:

```sql
update private.site_access_settings set restricted=true where singleton;
```

Otvorenie webu je reverzibilné:

```sql
update private.site_access_settings set restricted=false where singleton;
```

Pôvodné RLS a oprávnenia zostávajú platné v oboch režimoch. Ak bude treba pridať ďalšieho testera, musí byť ručne schválený a vložený do `private.site_testers`; žiadny verejný RPC na udeľovanie prístupu neexistuje.

Overenie: `test-private-site-sql.cjs` a `test-private-site-proxy.cjs`, `pnpm check`, `pnpm build`. SQL test pokrýva existujúce aj nové účty, anonymné požiadavky, RPC/GraphQL, ochranu zoznamu, hook, staged rollout a opätovné otvorenie. Proxy test pokrýva priame/PDF/API/POST prístupy, obnovu hesla, cookies, noindex/no-store, pozastavenie účtu a zlyhanie kontroly.

## Turnajové pozvánky

Po nasadení pozvánok existuje výnimka pre platný token na `/turnajova-pozvanka/<token>` a registráciu k nemu. Externý účet môže čítať danú pozvánku a odoslať odpoveď na overenie organizátorom. Nezíska tým všeobecný beta prístup. Data API povoľuje iba tokenom chránené pozvánkové RPC; ostatné tabuľky a funkcie ostávajú uzavreté. Podrobnosti sú v `tournament-invitation-links.md`.
