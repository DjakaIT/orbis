# Orbis

Dnevna geografska igra u tri moda: **Svijet** (države na 3D globusu), **Gradovi**
(glavni gradovi svijeta) i **Hrvatska** (naselja na 2D karti). Jedna meta po modu
dnevno, ista za sve igrače, generirana deterministički iz datuma — u jednom krugu
svaka meta dolazi na red točno jednom, pa nijedna država ne ispada iz igre. Uz to
privatna tjedna liga koja se zatvara petkom u 17:00.

Ime dolazi od latinskog _orbis_ — krug, kolo, svijet.

## Pokretanje

Traži Node 22+ i pnpm.

```bash
pnpm install
pnpm dev
```

## Naredbe

| Naredba        | Što radi                                                     |
| -------------- | ------------------------------------------------------------ |
| `pnpm dev`     | Dev server (Vite)                                            |
| `pnpm check`   | Lint + typecheck + testovi — mora proći prije svakog commita |
| `pnpm build`   | Produkcijski build                                           |
| `pnpm test`    | Vitest                                                       |
| `pnpm e2e`     | Playwright testovi — traži build, vidi niže                  |
| `pnpm analyze` | Build uz treemap bundlea u `dist/stats.html`                 |
| `pnpm format`  | Prettier                                                     |
| `pnpm dev:api` | Netlify dev: stranica + funkcije lige na istom originu       |

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
`pnpm build` mora proći prije `pnpm e2e`.

Nijedan test se ne preskače zbog nedostupnog poslužitelja. API lige se provjerava u
`tests/league/` protiv spremišta u memoriji, a sučelje u `tests/e2e/league-ui.spec.ts`
protiv presretnutih odgovora. Prije je bilo obrnuto: testovi lige tražili su pokrenut
backend i tiho se preskakali bez njega, pa je paket ostao zelen dok liga u produkciji
nije radila.

## Modovi

Svaki mod ima svoj bazen, svoju partiju, svoj streak i svoju skalu boja. Podaci
moda se dohvaćaju tek kad se mod odabere i nisu u precacheu service workera.

| Mod      | Meta        | Bazen    | Udaljenost              |
| -------- | ----------- | -------- | ----------------------- |
| Svijet   | država      | 199      | najmanja među granicama |
| Gradovi  | glavni grad | 192      | haversine među točkama  |
| Hrvatska | naselje     | 71 / 624 | haversine među točkama  |

Bazen država su **suverene države**, ne i teritoriji: kriterij je da država vlada
sama sobom, pa su unutra Andora, Monako i Palau, a vani Portoriko, Guam i Grenland.

U modu Svijet nula kilometara znači **dijeli granicu s metom**, ne pogodak —
susjed se u listi ispisuje kao „susjedna". Pogodak se izvodi iz identiteta mete.

## Liga

API lige je Netlifyjeva funkcija (`netlify/functions/api.mts`, Hono router), a
spremište su Netlify Blobs. Nema drugog servisa, druge prijave ni ijednog tokena:
liga se deploya zajedno sa stranicom.

```bash
pnpm dev:api                    # stranica + /api na istom portu
```

Logika je odvojena od Netlifyja. `netlify/lib/app.ts` izvozi `createApp(store)`, a
`netlify/lib/store.ts` uz Blobs nudi i spremište u memoriji — zato se cijeli API vrti
u `pnpm test`, bez mreže i bez emulatora:

```bash
pnpm test tests/league          # API, runde, ljestvica, tjedni
```

### Spajanje lige u produkciji

Ništa se ne spaja. Funkcija sama deklarira svoju putanju:

```ts
export const config: Config = { path: '/api/*' };
```

Time je API na istom originu kao i stranica — bez proxyja, bez CORS-a, bez varijable
s adresom koja može ostati prazna. Prije je API bio Cloudflare Worker, a pravilo koje
ga je spajalo stajalo je zakomentirano u `netlify.toml`, pa je prijava u ligu vraćala
404 stranicu hostinga. Da se to ne ponovi, `tests/build/deploy.test.ts` provjerava da
klijent, funkcija i `netlify.toml` govore istu stvar.

Runda se zatvara petkom u 17:00 po Zagrebu, ili ranije ako svi odigraju. Zakazanu
stranu radi `netlify/functions/close-rounds.mts`, koja se vrti **svaki sat petkom** i
sama provjerava zagrebački sat — fiksni UTC termin bi se ljeti i zimi razišao.

Nadimak nije lozinka: isti nadimak s novog uređaja je **novi** igrač. Povratak na
staro članstvo ide kroz link `/v/:token`, koji se pokazuje jednom nakon prijave.

## Tema

Dvije podloge. Stranica je topli papir; globus i karta žive u vlastitoj tamnoj
sceni, jer se karta crta na prozirnom canvasu i ondje bi tamno kopno i tamni
natpis pali jedno na drugo. Tokeni su zato razdvojeni — `--paper`, `--surface`,
`--rule`, `--ink*` za stranicu; `--stage`, `--ocean`, `--landmass`,
`--hairline`, `--stage-ink` za scenu.

Gradijent udaljenosti ima dvije skale svjetline: ton i zasićenje nose podatak na
obje podloge, svjetlina se prilagođava da ostane čitljiv. Sve omjere mjeri
`tests/styles/contrast.test.ts`, a tri signala pristupačnosti — smanjeno gibanje,
smanjena prozirnost, pojačan kontrast — provjerava `tests/e2e/a11y.spec.ts`.

## Dijeljenje i PWA

Ikone, OG slika i podskup fonta nastaju u `pnpm data` i nisu u gitu, kao ni podaci.

Adresa OG slike se ne upisuje u kod. Build je čita iz okoline: Netlify postavlja `URL`
za produkciju i `DEPLOY_PRIME_URL` za deploy preview, pa svaki preview pokazuje na sebe.
Lokalno ostaje root-relativna. Za ručni build s domenom:

```bash
VITE_SITE_URL=https://primjer.hr pnpm build
```

## Hosting

Sve je na Netlifyju (`netlify.toml`): stranica, API lige i njezino spremište. Deep
linkovi `/l/:code` i `/v/:token` su klijentske rute i traže SPA rewrite, koji je ondje
podešen. Za `/api/*` pravila nema i ne treba ga biti — funkcija svoju putanju
deklarira sama.

Blobs ne treba stvarati ni migrirati; spremište `orbis-league` nastaje pri prvom
upisu. Čita se i piše uz `consistency: 'strong'`, jer ljestvica koju vidiš odmah
nakon svoje partije mora sadržavati tu partiju.

## Struktura

```
src/engine/      čista logika: vrijeme, sjeme, udaljenost, pretraga, boja, bodovi
src/render/      three.js globus i canvas karta Hrvatske
src/components/  React sučelje
src/state/       reducer, kontekst, localStorage
netlify/lib/     API lige: router, podaci, runde, spremište
netlify/functions/  ulaz u funkciju i zakazano zatvaranje runde
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
