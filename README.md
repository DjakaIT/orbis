# Orbis

Dnevna geografska igra u dva moda: **Svijet** (države na 3D globusu) i **Hrvatska**
(naselja na 2D karti). Jedna meta po modu dnevno, ista za sve igrače, generirana
deterministički iz datuma. Uz to privatna tjedna liga koja se zatvara petkom u 17:00.

Ime dolazi od latinskog _orbis_ — krug, kolo, svijet.

## Pokretanje

Traži Node 22+ i pnpm.

```bash
pnpm install
pnpm dev
```

## Naredbe

| Naredba           | Što radi                                                     |
| ----------------- | ------------------------------------------------------------ |
| `pnpm dev`        | Dev server (Vite)                                            |
| `pnpm check`      | Lint + typecheck + testovi — mora proći prije svakog commita |
| `pnpm build`      | Produkcijski build                                           |
| `pnpm test`       | Vitest                                                       |
| `pnpm e2e`        | Playwright testovi — traži build, vidi niže                  |
| `pnpm analyze`    | Build uz treemap bundlea u `dist/stats.html`                 |
| `pnpm format`     | Prettier                                                     |
| `pnpm worker:dev` | Cloudflare Worker lokalno (od faze 3)                        |

## Testovi

`pnpm check` pokriva engine, sučelje i izlaz builda: PWA manifest, meta tagove za
dijeljenje, precache service workera, podskup fonta, generirane ikone i svaki budžet
iz SPEC §9.5.

Testovi nad `dist/` se preskaču ako builda nema, pa za punu pokrivenost:

```bash
pnpm build && pnpm check
```

E2E vozi dva servera: dev na `:5173` i `vite preview` na `:4173`. Drugi postoji zbog
`tests/e2e/pwa.spec.ts` — service worker, offline i manifest u razvoju ne postoje — pa
`pnpm build` mora proći prije `pnpm e2e`. Testovi lige se preskaču ako worker nije
pokrenut.

## Liga

API lige je Cloudflare Worker s D1 bazom. Lokalno:

```bash
pnpm -C worker exec wrangler d1 migrations apply orbis-db --local
pnpm worker:dev                 # :8787
```

Provjera backenda bez preglednika:

```bash
node worker/test-league.mjs     # API: auth, validacija, ljestvica
node worker/test-close.mjs …    # rano zatvaranje runde
```

## Dijeljenje i PWA

Ikone, OG slika i podskup fonta nastaju u `pnpm data` i nisu u gitu, kao ni podaci.

Adresa OG slike se ne upisuje u kod. Build je čita iz okoline: Netlify postavlja `URL`
za produkciju i `DEPLOY_PRIME_URL` za deploy preview, pa svaki preview pokazuje na sebe.
Lokalno ostaje root-relativna. Za ručni build s domenom:

```bash
VITE_SITE_URL=https://primjer.hr pnpm build
```

## Hosting

Frontend je na Netlifyju (`netlify.toml`). Deep linkovi `/l/:code` i `/v/:token`
traže SPA rewrite, koji je ondje podešen. API lige ostaje Worker; kad se deploya,
odkomentiraj `/api/*` proxy u `netlify.toml` da sve bude na istom originu.

## Struktura

```
src/engine/      čista logika: vrijeme, sjeme, udaljenost, pretraga, boja, bodovi
src/render/      three.js globus i canvas karta Hrvatske
src/components/  React sučelje
src/state/       reducer, kontekst, localStorage
worker/          Cloudflare Worker + D1 za ligu
scripts/         data pipeline i generatori fonta i ikona (izlaz nije u gitu)
tests/           Vitest (engine, stanje, build) i Playwright (e2e)
```

## Dokumenti

- [SPEC.md](SPEC.md) — potpuna specifikacija, jedini izvor istine
- [DECISIONS.md](DECISIONS.md) — odluke izvan SPEC-a, s datumom i obrazloženjem
- [CLAUDE.md](CLAUDE.md) — sažetak za svaku novu sesiju

## Podaci

Natural Earth (public domain), DGU Registar prostornih jedinica (otvorena licenca),
GeoNames (CC BY 4.0).
