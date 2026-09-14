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
| `pnpm e2e`        | Playwright smoke testovi                                     |
| `pnpm format`     | Prettier                                                     |
| `pnpm worker:dev` | Cloudflare Worker lokalno (od faze 3)                        |

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
scripts/         data pipeline (izlaz u public/data, nije u gitu)
tests/           Vitest (engine) i Playwright (e2e)
```

## Dokumenti

- [SPEC.md](SPEC.md) — potpuna specifikacija, jedini izvor istine
- [DECISIONS.md](DECISIONS.md) — odluke izvan SPEC-a, s datumom i obrazloženjem
- [CLAUDE.md](CLAUDE.md) — sažetak za svaku novu sesiju

## Podaci

Natural Earth (public domain), DGU Registar prostornih jedinica (otvorena licenca),
GeoNames (CC BY 4.0).
