# Tournio

Platforma na vyhľadávanie a vytváranie športových turnajov. Používa Next.js, TypeScript, Tailwind CSS, Supabase a Resend.

## Lokálne spustenie

Požiadavky: Node.js 20.9 alebo novší a pnpm.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Aplikácia bude dostupná na `http://localhost:3000`.

## Kontrola pred publikovaním

```bash
pnpm check
pnpm build
```

## Publikovanie cez Vercel

1. Nahrajte obsah tohto priečinka do GitHub, GitLab alebo Bitbucket repozitára.
2. Vo Verceli zvoľte **Add New → Project** a importujte repozitár.
3. Framework Preset ponechajte na **Next.js**.
4. Build Command ponechajte `pnpm build` a Output Directory nechajte prázdny.
5. Pridajte premennú prostredia `NEXT_PUBLIC_SITE_URL` s budúcou verejnou adresou.
6. Spustite **Deploy**. Po prvom nasadení upravte premennú na skutočnú doménu a vykonajte Redeploy.

Vercel automaticky rozpozná `pnpm-lock.yaml` a použije deklarovanú verziu pnpm. Autentifikácia a správa používateľov používajú Supabase; transakčné e-maily odosiela Resend cez overenú doménu `tournio.sk`.

## Premenné prostredia

Skopírujte `.env.example` ako `.env.local` iba pre lokálne nastavenia. Súbory `.env` a `.env.local` sa nesmú commitovať.

| Premenná | Povinná | Účel |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Povinná v produkcii | Kanonická URL pre metadata, sitemapu a robots.txt (`https://tournio.sk`) |
