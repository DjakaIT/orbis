# Orbis — potpuna specifikacija za izgradnju

> **Za Claude Code.** Ovo je jedini izvor istine za projekt. Pročitaj cijeli dokument prije prvog commita.
> Radi sekvencijalno, fazu po fazu. Svaka faza završava PR-om koji si sam otvorio, sam pregledao i mergeao.
> Ne preskači faze. Ne pitaj za pojašnjenja koja su već odgovorena u ovom dokumentu.

---

## 0. Što gradimo

**Orbis** je dnevna geografska igra u dva moda:

| Mod | Što se pogađa | Prikaz | Raspon udaljenosti |
|---|---|---|---|
| **Svijet** | Države | 3D globus (three.js) | 0 – 20.000 km |
| **Hrvatska** | Naselja | 2D karta (canvas + d3-geo) | 0 – 400 km |

Svaki dan jedna meta po modu, ista za sve igrače, generirana deterministički iz datuma.
Igrač upisuje ime, dobiva natrag udaljenost i smjer, i pokušava opet dok ne pogodi.

Uz to: **privatna tjedna liga** za šestero prijatelja. Bodovi po brzini pogađanja,
runda se zatvara petkom u 17:00 ili ranije ako svi odigraju.

Ime dolazi od latinskog *orbis* — krug, kolo, svijet. Domena: provjeri dostupnost
prije nego je zapišeš igdje u kod; u dokumentu se koristi `orbis.hr` kao radni placeholder.

---

## 1. Tehnološke odluke — obvezujuće

| Sloj | Izbor | Obrazloženje |
|---|---|---|
| Build | Vite 6 + React 19 + TypeScript 5.7 | ESM, brzi HMR, tree-shaking |
| 3D | **three.js direktno** | Kontrola nad draw callovima |
| 2D karta | d3-geo (samo projekcija) + Canvas 2D | Bez WebGL-a gdje ne treba |
| Geometrija | topojson-client | Dijeljeni lukovi između granica |
| Stil | CSS Modules | Nula runtimea, izolirani scope |
| Stanje | React kontekst + `useReducer` | Nema Reduxa, nema Zustanda — premalo stanja |
| Testovi | Vitest + @testing-library/react | Brzo, isti transform pipeline kao Vite |
| E2E smoke | Playwright (tri testa) | Provjera da se igra učita i odigra |
| Liga API | Cloudflare Workers + Hono + D1 | SQLite na edgeu, besplatno |
| Hosting | Cloudflare Pages | Neograničen bandwidth, 300+ lokacija |
| PWA | vite-plugin-pwa | Offline nakon prvog učitavanja |
| Paketi | **pnpm** | Brz, strog s peer dependencyjima |
| CI | GitHub Actions | Lint + typecheck + test + build na svaki PR |

### Zabranjeno

Ne instaliraj ništa od ovoga, bez obzira koliko se činilo zgodnim:

- `react-globe.gl` — 600+ KB omotača oko three.js-a koji nam ne treba
- `fuse.js` — pišemo vlastiti matcher, četrdesetak linija koda
- `tailwindcss` — premalo UI-a da opravda build pipeline
- `axios` — `fetch` je dovoljan
- bilo koji auth provider (Auth0, Clerk, Supabase Auth, Firebase) — vidi §7
- `moment` / `dayjs` / `date-fns` — koristi `Intl.DateTimeFormat` za vremenske zone
- `lodash` — nema potrebe
- bilo koja biblioteka za animacije (framer-motion, gsap) — imamo jednu animaciju, CSS je dovoljan

Ako se u nekom trenutku učini da nešto od gornjeg rješava problem, problem je krivo postavljen.

---

## 2. Dizajn

### 2.1 Teza

**Boja je isključivo informacija, nikad dekoracija.**

Cijelo sučelje je desaturirano, blizu monokromatskog — tamno indigo-crno, sivo-plave hairline
linije, prigušen tekst. Jedina zasićena boja u aplikaciji dolazi iz gradijenta udaljenosti.
Kad igrač pogodi Brazil i on se oboji tamnocrvenom, to je jedina crvena na ekranu. Kad pogodi
metu i ona zasvijetli zeleno, to je najsvjetlija stvar koju je vidio otkad je otvorio stranicu.

Ovo nije stilski hir nego funkcionalno ograničenje: igra se **čita po boji**, pa svaki piksel
obojanog chromea krade signal od podatka.

Vizualni rječnik je **instrumentni**, ne dekorativni — stare zvjezdane karte, sekstant, gravirane
skale. Globus je heroj; sve ostalo je očitanje instrumenta ispod njega.

### 2.2 Tokeni

```css
:root {
  /* Baza — plavo-crna noć, ne tintani crni */
  --void:        #080B14;  /* pozadina stranice */
  --ocean:       #10182B;  /* sfera, neotkriveni ocean */
  --landmass:    #1D2840;  /* kopno bez pogotka */
  --hairline:    #2C3A57;  /* granice, graticule, razdjelnici */
  --surface:     #0D1322;  /* input polje, kartice lige */

  /* Tekst */
  --ink:         #E6EAF2;
  --ink-muted:   #7D8AA6;
  --ink-faint:   #4A5878;

  /* Semantika — jedine boje izvan gradijenta */
  --hit:         oklch(0.85 0.19 152);
  --error:       oklch(0.65 0.17 25);

  /* Tipografija */
  --font: 'Bricolage Grotesque Variable', system-ui, sans-serif;

  /* Modularna skala, omjer 1.25, baza 16px */
  --t-xs: 0.64rem;  --t-sm: 0.8rem;   --t-base: 1rem;
  --t-md: 1.25rem;  --t-lg: 1.563rem; --t-xl: 1.953rem; --t-2xl: 2.441rem;

  /* Prostor, skala od 4px */
  --s-1: 0.25rem; --s-2: 0.5rem; --s-3: 0.75rem; --s-4: 1rem;
  --s-6: 1.5rem;  --s-8: 2rem;   --s-12: 3rem;   --s-16: 4rem;

  --radius: 2px;   /* gotovo oštro — instrument, ne kartica */
}
```

**Zašto ovaj plavo-crni, a ne obični tamni:** `#080B14` ima mjerljiv plavi pomak. Tintani
near-black (`#0B0B0B`, `#111`) je generički default; ovdje je pozadina noćno nebo iza globusa
i to mora biti očito iz same boje.

### 2.3 Tipografija

Jedna obitelj, dvije uloge, kroz varijabilne osi:

- **Bricolage Grotesque Variable**, self-hostano preko `@fontsource-variable/bricolage-grotesque`
- Wordmark i naslovi: `font-variation-settings: 'wdth' 85, 'opsz' 48` — uže i optički veće
- Tijelo i očitanja: `'wdth' 100, 'opsz' 14`
- **Udaljenosti obavezno `font-variant-numeric: tabular-nums`** — brojevi se moraju poravnavati
  u koloni jer se čitaju kao instrument, ne kao proza
- Tisućice razdvoji tankim razmakom (`U+2009`), po hrvatskom pravopisu: `9 412 km`

Zabranjeno u tipografiji: ALL CAPS labeli iznad sadržaja; naglašavanje jedne riječi u naslovu
drugom bojom ili kurzivom; monospace za male podatkovne labele; strelica `→` zalijepljena na
tekst gumba.

### 2.4 Layout

```
┌───────────────────────────────────┐
│ Orbis              Svijet  Hrvatska│  ← wordmark lijevo, mod desno
│ ═══════════════════════════════════│  ← hairline
│                                   │
│                                   │
│            ◯                      │  ← globus, ~55vh, heroj
│                                   │
│                                   │
│ ───────────────────────────────── │
│ ┌───────────────────────────────┐ │
│ │ Upiši državu                  │ │  ← input, uvijek vidljiv bez scrolla
│ └───────────────────────────────┘ │
│                                   │
│  ▌ Brazil            9 412 km  ↗  │  ← očitanja; ▌ = traka u boji udaljenosti
│  ▌ Španjolska        6 841 km  ↙  │
│  ▌ Turska            2 103 km  ←  │
│  ▌ Hrvatska              0 km  ✦  │
│                                   │
│ ═══════════════════════════════════│
│ Podijeli            Liga · 2. mj. │
└───────────────────────────────────┘
```

Imena lijevo, brojevi desno (tabular), strelice u fiksnoj koloni. Traka u boji je vertikalna
linija debljine 3px lijevo od retka — jedina pojava gradijenta izvan karte, i vizualno povezuje
listu s globusom.

Sortiranje: **po udaljenosti, najdalje gore**, tako da je najbliži pogodak uvijek neposredno
iznad inputa. Toggle za kronološki redoslijed postoji, ali default je po udaljenosti.

### 2.5 Motion

Jedan orkestriran trenutak: **boja se ulijeva u državu** pri pogotku. Animiraj `t` od 0 do 1
kroz 420 ms (`cubic-bezier(0.2, 0, 0, 1)`) i u svakom frameu ponovno iscrtaj taj poligon s
`globalAlpha = t`. Istovremeno novi redak u listi klizne iz visine 0 u punu visinu.

Sve ostalo je statično. Bez fade-in po sekcijama, bez hover tranzicija na svakoj kartici, bez
skeleton loadera, bez confettija. Pogodak se slavi time što meta dobije `--hit` boju i globus
se jednom polagano zarotira da je centrira.

Poštuj `prefers-reduced-motion: reduce` — tada boja upada odmah, bez interpolacije i bez rotacije.

---

## 3. Struktura repozitorija

```
orbis/
├── .github/workflows/
│   ├── ci.yml                        # lint + typecheck + test + build na PR
│   └── deploy.yml                    # CF Pages deploy pri mergeu u main
├── scripts/
│   ├── fetch-sources.ts
│   ├── build-data.ts
│   ├── hr-names.json                 # ISO3 → hrvatsko ime države
│   └── aliases.json
├── public/
│   ├── data/                         # generirano, .gitignore
│   ├── _headers
│   └── icon-192.png · icon-512.png
├── src/
│   ├── main.tsx · App.tsx
│   ├── styles/tokens.css · reset.css
│   ├── engine/
│   │   ├── time.ts                   # Europe/Zagreb datumska logika
│   │   ├── seed.ts                   # deterministički PRNG
│   │   ├── distance.ts               # haversine + bearing + matrix lookup
│   │   ├── search.ts                 # normalizacija + fuzzy match
│   │   ├── color.ts                  # oklch skala + oklch→rgb za canvas
│   │   └── scoring.ts                # bodovi za ligu
│   ├── render/
│   │   ├── globe.ts                  # three.js scena, imperativno
│   │   ├── texture.ts                # equirectangular canvas painter
│   │   └── mapHR.ts                  # d3-geo canvas painter
│   ├── components/
│   │   ├── Globe.tsx · MapHR.tsx
│   │   ├── GuessInput.tsx · GuessList.tsx
│   │   ├── ModeToggle.tsx · Header.tsx · ShareSheet.tsx
│   │   └── league/
│   │       ├── Onboard.tsx · CreateLeague.tsx · JoinLeague.tsx
│   │       └── Standings.tsx · RoundSummary.tsx
│   ├── state/GameContext.tsx · reducer.ts · persist.ts
│   ├── data/load.ts
│   ├── league/client.ts · types.ts
│   └── types/index.ts
├── worker/
│   ├── src/
│   │   ├── index.ts                  # Hono app + cron handler
│   │   ├── routes/players.ts · leagues.ts · scores.ts
│   │   ├── rounds.ts                 # logika zatvaranja runde
│   │   ├── auth.ts · db.ts
│   ├── migrations/0001_init.sql
│   ├── wrangler.toml · package.json
├── tests/engine/ · tests/e2e/
├── CLAUDE.md · README.md · SPEC.md · DECISIONS.md
├── vite.config.ts · tsconfig.json
├── pnpm-workspace.yaml · package.json
```

---

## 4. Data pipeline

Pokreće se kao `pnpm data`. Izlaz ide u `public/data/` i **nije u gitu** — reproducibilan je,
a CI ga regenerira pri deployu.

### 4.1 Izvori

| Podatak | Izvor | Licenca |
|---|---|---|
| Granice država | Natural Earth `ne_110m_admin_0_countries` | Public domain |
| Hrvatska naselja | DGU Registar prostornih jedinica, `data.gov.hr` | Otvorena |
| Fallback naselja | GeoNames `HR.zip` | CC BY 4.0 |

Natural Earth:
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson`

**Za DGU:** URL nije stabilan. `fetch-sources.ts` neka pokuša dohvat i, ako ne uspije, ispiše
jasnu uputu da se dataset ručno spusti u `scripts/.cache/`. **Nemoj izmišljati URL.**

Atribucija u footeru: „Podaci: Natural Earth, DGU, GeoNames". GeoNames licenca to traži.

### 4.2 Granice država

```bash
npx mapshaper ne_110m_admin_0_countries.geojson \
  -filter 'ISO_A3 !== "-99"' \
  -simplify visvalingam 8% keep-shapes \
  -filter-fields ISO_A3,NAME \
  -o format=topojson quantization=1e4 world-topo.json
```

`keep-shapes` je obavezan — bez njega male otočne države nestanu pri simplifikaciji.

Hrvatska imena država nisu u Natural Earthu. `scripts/hr-names.json` mora imati mapu
`ISO_A3 → hrvatsko ime` za sve države u datasetu. Generiraj je i **ručno provjeri**; ovo je
jedini dio pipelinea gdje je greška vidljiva korisniku. Za državu čiji hrvatski egzonim nije
siguran, ostavi izvorni naziv i zabilježi je u `scripts/MISSING_HR.md` umjesto da pogađaš.

### 4.3 Matrica udaljenosti

Centroidi lažu za velike države — udaljenost Rusija–Finska po centroidima ispadne preko 4.000 km
iako dijele granicu. Računamo **minimalnu udaljenost između granica**.

```
za svaki par (A, B):
  ako je udaljenost bounding boxova > dosad najbolje → preskoči
  min po svim parovima točaka granica A i B
```

Naivno je O(n²·p²) i traje predugo. Dvije optimizacije su obavezne: bounding box pre-filter,
i redukcija granice svake države na najviše 250 točaka uniformnim uzorkovanjem po duljini luka.

Izlaz `world-matrix.bin` kao `Uint16Array(N*N)`:
- indeks `m[a * N + b]`, vrijednost u kilometrima
- Uint16 ide do 65535; najveća stvarna udaljenost je oko 20.000
- ~125 KB sirovo, oko 40 KB gzipano
- **runtime cijena po pogotku: jedan pristup nizu**

Uz to `world-meta.json`:
```json
{ "n": 177, "countries": [{ "id": 0, "iso": "AFG", "name": "Afganistan", "lat": 33.9, "lon": 67.7 }] }
```
`lat`/`lon` su centroidi i koriste se **samo za smjer strelice**, nikad za udaljenost.

### 4.4 Hrvatska naselja

Naselja su točke pa matrica nije potrebna — haversine u runtimeu je trivijalan.

| Razina | Kriterij | Očekivano |
|---|---|---|
| `gradovi` | > 5.000 stanovnika | ~60 |
| `mjesta` | > 800 stanovnika | ~250 |

Treću razinu (svih ~6.500 naselja) **ne gradimo** — s tolikim brojem igra prelazi u nagađanje.

Ako DGU nema populaciju, spoji s GeoNames `population` poljem po imenu i županiji. Gdje
spajanje ne uspije, zabilježi u `scripts/MISSING_POP.md` i izostavi naselje —
**nemoj procjenjivati broj stanovnika.**

Izlaz `hr-places.json` i `hr-outline.json` (obris države + županijske linije za podlogu).

### 4.5 Indeks pretrage

```ts
export function normalize(s: string): string {
  return s
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')   // NFD ne rastavlja Đ!
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')          // Š→S, Ž→Z, Ć/Č→C
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
```

`Đ`/`đ` nema kombinirajući dijakritik u Unicodeu i `NFD` ga neće rastaviti — mora se obraditi
eksplicitno, prije `normalize('NFD')`. Napiši test koji provjerava `normalize('Đakovo') === 'dakovo'`.

`scripts/aliases.json` za ručne dodatke:
```json
{
  "world": { "amerika": "USA", "sad": "USA", "engleska": "GBR", "velikabritanija": "GBR" },
  "hr":    { "djakovo": "Đakovo", "sibenik": "Šibenik" }
}
```
Tijekom developmenta logiraj neprepoznate unose u konzolu i dopunjavaj ovu datoteku.

---

## 5. Engine

### 5.1 Vrijeme (`engine/time.ts`)

**Sve datumske granice su Europe/Zagreb, nikad UTC.** Igrači su u Hrvatskoj; nova zagonetka
stiže u ponoć po njihovom satu, liga se zatvara u 17:00 po njihovom satu.

```ts
const TZ = 'Europe/Zagreb';

/** "YYYY-MM-DD" za trenutni zagrebački dan. */
export function zagrebDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function zagrebHour(d?: Date): number      { /* 0–23 */ }
export function zagrebWeekday(d?: Date): number   { /* 1 = pon … 7 = ned */ }
export function msUntilNextPuzzle(d?: Date): number { /* do zagrebačke ponoći */ }

/** round_id = datum petka kojim runda ZAVRŠAVA, "YYYY-MM-DD". */
export function roundIdFor(d: Date = new Date()): string { /* vidi §7.3 */ }
```

`en-CA` locale daje `YYYY-MM-DD` izravno. Ovo rješava i ljetno/zimsko računanje vremena
bez ijedne biblioteke. **Nijedan drugi modul ne smije zvati `new Date()` ni `Date.now()`.**

### 5.2 Dnevna meta (`engine/seed.ts`)

```ts
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SALT = 'orbis-v1';

export function dailyTarget(date: string, mode: 'world' | 'hr', poolSize: number): number {
  const base = Math.floor(mulberry32(xmur3(`${date}:${mode}:${SALT}`)())() * poolSize);
  // izbjegni ponavljanje unutar 30 dana — deterministički, isto na svim klijentima
  const recent = new Set(
    lastNDates(date, 30).map(d =>
      Math.floor(mulberry32(xmur3(`${d}:${mode}:${SALT}`)())() * poolSize)),
  );
  let i = base;
  while (recent.has(i)) i = (i + 1) % poolSize;
  return i;
}
```

Ključno: izbjegavanje ponavljanja mora se računati iz **istih determinističkih sjemena**, ne iz
lokalne povijesti — inače bi dva igrača dobila različite mete.

**SALT se ne smije mijenjati nakon puštanja u rad.** Promjena pomiče sve buduće mete i razbija
rundu u tijeku.

### 5.3 Udaljenost i smjer (`engine/distance.ts`)

```ts
const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2))
    - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Svijet: prebuildana matrica, O(1). Nikad haversine na centroidima. */
export function worldDistance(a: number, b: number, m: Uint16Array, n: number): number {
  return m[a * n + b];
}
```

Strelica: osam smjerova (`↑ ↗ → ↘ ↓ ↙ ← ↖`), azimut zaokružen na 45°. Pri udaljenosti 0
prikaži `✦`.

### 5.4 Pretraga (`engine/search.ts`)

Tri koraka, prvi koji uspije pobjeđuje:

1. **Točan pogodak** u normaliziranoj mapi (uključuje aliase)
2. **Jedinstveni prefiks** — unos od ≥3 znaka koji ima točno jedan kandidat
3. **Levenshtein ≤ 1**, ali samo nad kandidatima koji dijele prva dva znaka

Treći korak je ključan za performanse: ~20 usporedbi umjesto 6.500. Rani izlaz ako se duljine
razlikuju za više od 1.

Autocomplete prikazuje najviše šest prijedloga. Na mobitelu dropdown ide **prema gore** ako input
nije u gornjoj polovici ekrana, inače ga tipkovnica prekrije.

### 5.5 Boja (`engine/color.ts`)

```ts
export function distanceColor(km: number, mode: 'world' | 'hr'): string {
  if (km === 0) return 'var(--hit)';
  const max = mode === 'world' ? 20000 : 400;
  const t = Math.min(km / max, 1);
  const L = 0.78 - t * 0.34;   // blizu = svjetlije
  const C = 0.20 - t * 0.09;   // blizu = zasićenije
  const H = 28 + t * 232;      // crvena → narančasta → … → indigo
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}
```

`oklch` je perceptivno ravnomjeran; RGB interpolacija daje blatnjavu sredinu oko 6.000 km,
gdje je najviše pogodaka. Canvas 2D ne prima `oklch` string pouzdano u svim preglednicima —
napiši `oklchToRgb()` u istom modulu i testiraj je protiv nekoliko poznatih vrijednosti.

Odvojena skala za Hrvatsku je nužna: na svjetskoj skali cijela Hrvatska bila bi jedna te ista
crvena.

### 5.6 Bodovanje (`engine/scoring.ts`)

Bodovi po odigranoj zagonetki, po modu:

| Pokušaja | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ | neodigrano |
|---|---|---|---|---|---|---|---|---|---|
| Bodovi | 10 | 8 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |

```ts
const TABLE = [0, 10, 8, 6, 5, 4, 3, 2];
export function points(guesses: number): number {
  if (guesses < 1) return 0;
  return TABLE[guesses] ?? 1;
}
```

Oba moda se boduju i zbrajaju — tko odigra i svijet i Hrvatsku dnevno može do 20 bodova.

**Razrješavanje izjednačenja**, redom: (1) više bodova, (2) manje ukupnih pokušaja kroz rundu,
(3) kraće ukupno vrijeme rješavanja, (4) abecedno po nadimku.

---

## 6. Renderiranje

### 6.1 Globus

**Jedna sfera, jedna tekstura, jedan draw call.** Ne stvaraj mesh po državi.

```
SphereGeometry(1, 96, 96) + MeshBasicMaterial({ map: canvasTexture })
  — bez svjetla; boje su podatak i ne smiju ovisiti o kutu osvjetljenja
Zvijezde: Points, 800 točaka na sferi radijusa 40, boja --ink-faint
```

Tekstura je `OffscreenCanvas` 2048 × 1024, equirectangular:

```ts
const project = (lon: number, lat: number, w: number, h: number): [number, number] =>
  [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
```

Slojevi odozdo prema gore: ocean (`--ocean`) → graticule svakih 30° (`--hairline`, 1px) →
sve kopno (`--landmass`) → pogođene države (`distanceColor`) → granice (`--hairline`, 0.8px).

Pri pogotku prebojaj **samo tu državu** i postavi `texture.needsUpdate = true`. Nemoj ponovno
crtati cijelu teksturu.

Poligoni preko antimeridijana (Rusija, Fiji) moraju se rezati na ±180 — inače dobiješ vodoravnu
crtu preko cijele karte. Riješi u build koraku (`mapshaper -clip`) ili u crtanju, detekcijom
skoka > 180° u longitudi.

**Kontrole:** vlastiti orbit handler, ne `OrbitControls` iz `three/examples` — donosi nepotreban
kod. Samo rotacija, bez zooma i pana. Blago auto-rotiranje (0,15°/frame) koje staje na prvi
dodir i ne vraća se. Pri pogotku mete animiraj rotaciju tako da meta dođe u centar, 900 ms, ease-out.

### 6.2 Karta Hrvatske

Canvas 2D, bez WebGL-a.

```ts
const projection = geoConicConformal()
  .parallels([43.0, 46.0])
  .rotate([-16.5, 0])
  .center([0, 44.8])
  .fitExtent([[16, 16], [w - 16, h - 16]], hrOutline);
```

Slojevi: obris Hrvatske (`--landmass` ispuna, `--hairline` rub) → županijske granice
(`--hairline`, 0.5px, alpha 0.5) → pogođena naselja (krug r=5px u boji udaljenosti, ime pokraj) →
meta nakon pogotka (krug r=7px u `--hit`).

Naselja su točke pa nema ispune područja. Umjesto toga oko svakog pogotka nacrtaj tanki prsten
radijusa proporcionalnog udaljenosti (skalirano kroz projekciju) — igrač vidi da je meta „negdje
na ovom krugu". Bolji feedback od gole točke, a mehanički je pošteno: prsteni se sijeku i sužavaju
prostor.

---

## 7. Liga

### 7.1 Opseg

Ovo je **privatna liga za šestero ljudi koji se poznaju.** To mijenja sve inženjerske odluke:
ne treba obrana od zlouporabe u velikom broju, ne treba oporavak računa, ne treba moderiranje.
Treba da proradi iz prve i da nitko ne odustane na prijavi.

### 7.2 Prijava — najmanja moguća frikcija

**Cijela registracija je: upiši nadimak.** Bez emaila, lozinke, potvrde, OAutha, captche.

```
1. Prijatelj otvori  orbis.hr/l/K7M2PQ
2. Vidi: "Pridružuješ se ligi Ekipa. Kako da te zovemo?"  [______]  [Uđi]
3. Klik → Worker kreira igrača i vraća token
4. Token u localStorage. Igrač je unutra.
```

Osam sekundi, nijedan korak na kojem se može odustati.

**Kako radi:** Worker generira `player_id` (UUIDv4) i `token` (32 nasumična bajta, hex). Token
ide klijentu i živi u `localStorage`. U bazi se čuva samo SHA-256 hash tokena, nikad plaintext.

**Trade-off, svjesno prihvaćen:** brisanje podataka preglednika znači gubitak identiteta.
Za šestero prijatelja to je prihvatljivo. Ublažavanje bez dodavanja frikcije:

- Nakon prve prijave prikaži **jednom** link za povrat `orbis.hr/v/<token>` uz tekst
  „Spremi ovaj link ako promijeniš uređaj". Nema obavezne radnje — tko spremi, spremio je.
- Isti link služi i za igranje na drugom uređaju.

### 7.3 Runda

Runda traje tjedan i zatvara se **petkom u 17:00 po zagrebačkom vremenu**.

```
počinje:   petak 17:00
završava:  sljedeći petak 17:00
round_id:  datum petka kojim runda ZAVRŠAVA, npr. "2026-09-18"
```

Bodovi se zbrajaju kroz rundu; sedam zagonetki po modu.

**Rano zatvaranje:** ako su svi članovi lige predali rezultat za posljednji dan runde (petak)
prije 17:00, runda se zatvara odmah. Time je pokriven slučaj „gotovi smo, daj rezultate" bez
čekanja.

Provjera se okida na dva mjesta:
- nakon svakog `POST /api/scores` — je li to bio zadnji nedostajući rezultat?
- kroz Cron Trigger `0 * * * 5` (petkom svaki sat), koji zatvara rundu čim `zagrebHour() >= 17`

Satni cron s provjerom lokalnog sata je otporan na ljetno/zimsko vrijeme; fiksni UTC cron ne bi bio.

Pri zatvaranju: snimi konačnu ljestvicu u `rounds.results` kao JSON, postavi `closed_at`, otvori
sljedeću rundu. Zatvorena runda je nepromjenjiva — rezultati za njene dane se odbijaju s 409.

### 7.4 Shema baze

`worker/migrations/0001_init.sql`:

```sql
CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  nickname    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE leagues (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES players(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE members (
  league_id   TEXT NOT NULL REFERENCES leagues(id),
  player_id   TEXT NOT NULL REFERENCES players(id),
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (league_id, player_id)
);

CREATE TABLE scores (
  player_id   TEXT NOT NULL REFERENCES players(id),
  puzzle_date TEXT NOT NULL,                          -- zagrebački dan
  mode        TEXT NOT NULL CHECK (mode IN ('world','hr')),
  guesses     INTEGER NOT NULL CHECK (guesses >= 1),
  elapsed_ms  INTEGER NOT NULL,
  round_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, puzzle_date, mode)
);

CREATE TABLE rounds (
  league_id   TEXT NOT NULL REFERENCES leagues(id),
  round_id    TEXT NOT NULL,
  closed_at   TEXT,           -- NULL = u tijeku
  results     TEXT,           -- JSON snapshot konačne ljestvice
  PRIMARY KEY (league_id, round_id)
);

CREATE INDEX idx_scores_round ON scores(round_id, mode);
CREATE INDEX idx_members_league ON members(league_id);
```

Kod lige: šest znakova iz `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — bez `0/O` i `1/I/L` jer se
diktira preko telefona.

### 7.5 API

| Metoda | Ruta | Tijelo | Vraća |
|---|---|---|---|
| POST | `/api/players` | `{nickname}` | `{player_id, token}` |
| GET | `/api/me` | — | `{player_id, nickname, leagues[]}` |
| POST | `/api/leagues` | `{name}` | `{code, league_id}` |
| POST | `/api/leagues/:code/join` | — | `{league_id, name}` |
| GET | `/api/leagues/:code` | — | `{name, round_id, closes_at, standings[], everyone_done}` |
| GET | `/api/leagues/:code/rounds` | — | `{rounds:[{round_id, closed_at, results}]}` |
| POST | `/api/scores` | `{puzzle_date, mode, guesses, elapsed_ms}` | `{ok, round_id, round_closed}` |

Sve osim `POST /api/players` traži `Authorization: Bearer <token>`.

**Middleware:** token → SHA-256 → lookup u `players`, inače 401. Rate limit 60 req/min po
`CF-Connecting-IP`. CORS samo za produkcijsku domenu i `http://localhost:5173`.

**Validacija rezultata:**
- `puzzle_date` mora biti današnji ili jučerašnji zagrebački dan (tolerancija oko ponoći)
- `guesses >= 1`; `elapsed_ms` između 1.000 i 3.600.000
- jedan rezultat po igraču/danu/modu — `INSERT OR IGNORE`, ponovni pokušaj tiho pada
- runda za taj datum već zatvorena → 409

Anti-cheat namjerno ostaje minimalan. Meta je u klijentskom bundleu i tko je želi naći, naći će je.
Kod šestero prijatelja to je socijalni problem, ne tehnički.

### 7.6 Sučelje lige

```
Ekipa                          zatvara se u pet, 17:00
────────────────────────────────────────────────────
1  Daniel            74      12 pokušaja
2  Marta             68      15 pokušaja
3  Ivan              61      19 pokušaja
4  Petra             55      14 pokušaja   ✓ odigrao danas
5  Luka              40      22 pokušaja
6  Tomislav          38      11 pokušaja   ⋯ nije još
────────────────────────────────────────────────────
```

Kvačica pokazuje tko je danas odigrao — to je jedini podatak koji ekipu tjera da zaigra.
**Ne prikazuj tuđe današnje rezultate dok igrač sam nije odigrao** — inače se iz broja pokušaja
vidi je li zagonetka teška.

Kad se runda zatvori, prikaži `RoundSummary` — konačna ljestvica, pobjednik, gumb za dijeljenje
u grupni chat.

Share tekst:
```
Orbis 🌍 15.9. — 4 pokušaja
🟦🟪🟧🟩
orbis.hr
```
Kvadratići su boje pogodaka po redoslijedu, mapirane na najbliži emoji.

---

## 8. Lokalno stanje

```ts
interface Persisted {
  v: 1;
  world: { date: string; guesses: number[]; solved: boolean; startedAt: number } | null;
  hr:    { date: string; guesses: number[]; solved: boolean; startedAt: number;
           tier: 'gradovi' | 'mjesta' } | null;
  stats: {
    world: { played: number; solved: number; streak: number; maxStreak: number; dist: number[] };
    hr:    { played: number; solved: number; streak: number; maxStreak: number; dist: number[] };
  };
  player: { id: string; token: string; nickname: string } | null;
  lastLeagueCode: string | null;
  prefs: { sortBy: 'distance' | 'time' };
}
```

Ključ `orbis:v1`. Pri promjeni sheme podigni `v` i napiši migraciju — nikad ne briši tuđe streakove.

Pri učitavanju: ako `world.date !== zagrebDate()`, resetiraj tu partiju, ali prije toga ažuriraj
statistiku. Streak se lomi tek kad prođe cijeli dan bez rješenja, ne pri samom resetu.

---

## 9. Konfiguracija

### 9.1 `package.json`

```json
{
  "name": "orbis",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "data": "tsx scripts/build-data.ts",
    "build": "pnpm data && tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "playwright test",
    "check": "pnpm lint && pnpm typecheck && pnpm test",
    "analyze": "vite build --mode analyze",
    "worker:dev": "pnpm -C worker dev",
    "worker:deploy": "pnpm -C worker deploy",
    "db:init": "pnpm -C worker exec wrangler d1 migrations apply orbis-db --remote"
  }
}
```

`pnpm check` mora proći prije svakog commita. Bez iznimke.

### 9.2 `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,bin,woff2,png}'],
        runtimeCaching: [{
          urlPattern: /\/data\/.*\.(json|bin)$/,
          handler: 'CacheFirst',
          options: { cacheName: 'orbis-data', expiration: { maxAgeSeconds: 2592000 } },
        }],
      },
      manifest: {
        name: 'Orbis', short_name: 'Orbis',
        description: 'Dnevna geografska igra', lang: 'hr',
        theme_color: '#080B14', background_color: '#080B14',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
```

### 9.3 `public/_headers`

```
/data/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.woff2
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: public, max-age=0, must-revalidate
```

### 9.4 `worker/wrangler.toml`

```toml
name = "orbis-api"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[d1_databases]]
binding = "DB"
database_name = "orbis-db"
database_id = ""   # popuni nakon `wrangler d1 create orbis-db`

[triggers]
crons = ["0 * * * 5"]   # petkom svaki sat; handler provjerava zagrebački sat

[vars]
ALLOWED_ORIGIN = "https://orbis.hr"
```

### 9.5 Budžeti performansi

| Asset | Gzip |
|---|---|
| JS bez three.js | 45 KB |
| three.js chunk | 85 KB |
| `world-topo.json` | 40 KB |
| `world-matrix.bin` | 40 KB |
| font woff2 | 32 KB |
| CSS | 6 KB |
| **Prvi load, mod svijet** | **≤ 250 KB** |
| HR podaci (lazy, tek na odabir moda) | 60 KB |

Ako PR probije budžet, ne mergeaj — nađi uzrok. `rollup-plugin-visualizer` u `analyze` skripti.

Lighthouse ciljevi: Performance ≥ 95, Accessibility 100, Best Practices 100.

---

## 10. Faze

Svaka faza je jedna grana, jedan PR, jedan self-review, jedan merge.
Grane: `feat/f0-temelji`, `feat/f1-jezgra`, `feat/f2-hrvatska`, `feat/f3-liga`, `feat/f4-dovrsetak`.

### Faza 0 — Temelji

- `pnpm create vite orbis --template react-ts`, pnpm workspace za `worker/`
- ESLint (flat config) + Prettier + strict TS (`strict`, `noUncheckedIndexedAccess`)
- Vitest i Playwright setup
- `.github/workflows/ci.yml` — na svaki PR `pnpm check` + `pnpm build`
- `src/styles/tokens.css` iz §2.2, self-hostani font
- `CLAUDE.md` (§11.6), `README.md`, prazan `DECISIONS.md`

**Gotovo kad:** `pnpm check` prolazi, CI je zelen.

### Faza 1 — Jezgra igre, mod svijet

- `scripts/fetch-sources.ts` + `build-data.ts` — topo, matrica, meta, indeks pretrage
- `engine/`: `time`, `seed`, `distance`, `search`, `color` — **svaki s testovima**
- `render/texture.ts` + `render/globe.ts` — sfera, tekstura, vlastiti orbit handler
- `components/`: `Globe`, `GuessInput`, `GuessList`, `Header`
- `state/`: reducer, kontekst, localStorage perzistencija
- `ShareSheet` — emoji grid i copy u međuspremnik

**Gotovo kad:** igra se odigra do kraja na mobitelu, stanje preživi refresh, share se kopira.
Engine testovi prolaze, uključujući `normalize('Đakovo') === 'dakovo'` i provjeru da
`dailyTarget` vraća isto za isti datum.

### Faza 2 — Mod Hrvatska

- Dohvat i obrada DGU/GeoNames podataka, dvije razine težine
- `render/mapHR.ts` — konična projekcija, canvas slojevi, prsteni udaljenosti
- `ModeToggle` + lazy `import()` HR podataka tek pri odabiru moda
- Odvojena skala boja, odvojena statistika, odvojen streak

**Gotovo kad:** oba moda rade neovisno i HR podaci se **ne preuzimaju** dok se mod ne odabere
(provjeri u Network tabu).

### Faza 3 — Liga

- `wrangler d1 create orbis-db`, migracija, Hono rute, auth middleware
- Logika runde: `roundIdFor`, rano zatvaranje, Cron Trigger, snapshot rezultata
- Frontend: `Onboard`, `CreateLeague`, `JoinLeague`, `Standings`, `RoundSummary`
- Auto-submit rezultata pri pogotku
- Deep link `/l/:code` → automatsko pridruživanje nakon upisa nadimka
- Recovery link `/v/:token`

**Gotovo kad:** dva preglednika (jedan incognito) kreiraju ligu, pridruže se, odigraju i vide
ispravnu ljestvicu. Ručno testiraj rano zatvaranje tako da privremeno skratiš rundu na jedan dan.

### Faza 4 — Dovršetak

- PWA manifest, ikone, offline fallback
- OG meta tagovi i share slika
- `prefers-reduced-motion` svugdje; fokus prstenovi vidljivi tipkovnicom; `aria-live` za udaljenost
- Playwright smoke: učitavanje, jedan pogodak, pridruživanje ligi
- Lighthouse audit, bundle analiza
- Deploy: `wrangler pages deploy` i `wrangler deploy`

**Gotovo kad:** aplikacija je na produkcijskoj domeni, PWA se instalira, Lighthouse ciljevi postignuti.

---

## 11. Radni proces

### 11.1 Git

- `main` je uvijek deployabilan. Nikad ne commitaj direktno u `main`.
- Jedna grana po fazi; unutar faze commitaj često, malim koracima.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`
- Poruka commita na engleskom, opis PR-a na hrvatskom.

### 11.2 Prije svakog commita

```bash
pnpm check
```

Ako padne, popravi prije commita. Ne koristi `--no-verify`.

### 11.3 Self-review prije otvaranja PR-a

Pročitaj vlastiti diff i provjeri redom:

1. **Zabranjene ovisnosti** — je li išta iz §1 uvučeno, direktno ili tranzitivno? (`pnpm why`)
2. **Budžet** — `pnpm build` pa usporedi s §9.5. Probijeno?
3. **Determinizam** — ima li `Math.random()` igdje? Bilo gdje osim generiranja tokena u workeru
   to je bug.
4. **Vremenska zona** — ima li igdje `new Date()`, `Date.now()` ili `toISOString().slice(0,10)`
   izvan `engine/time.ts`? To je UTC i pogrešno je.
5. **Draw callovi** — stvara li se mesh po državi umjesto jedne teksture?
6. **Boja** — ima li zasićene boje izvan gradijenta udaljenosti i `--hit`/`--error`?
7. **Izmišljeni podaci** — ima li hardkodirana populacija, koordinata ili hrvatski naziv koji
   nije došao iz izvora? Ako da, ukloni i zabilježi u `MISSING_*.md`.
8. **Pristupačnost** — fokus vidljiv, kontrast ≥ 4.5:1, `aria-live` za objavu udaljenosti.
9. **Mrtvi kod** — zakomentirani blokovi, `console.log`, `TODO` bez issuea.
10. **Testovi** — ima li novi engine kod test? UI ne mora, engine mora.

Nalaz zapiši u opis PR-a kao checklistu. Ako si našao problem, popravi ga prije otvaranja PR-a,
ne nakon.

### 11.4 Opis PR-a

```markdown
## Što
Kratko, na hrvatskom, što faza donosi.

## Ključne odluke
Sve gdje si odstupio od SPEC.md-a ili gdje je SPEC ostavio prostora — i zašto.

## Self-review
- [x] Nema zabranjenih ovisnosti
- [x] Bundle: 238 KB / 250 KB
- [ ] ... svih 10 iz §11.3

## Otvoreno
Što svjesno ostaje za kasnije.
```

### 11.5 Kad zapneš

Ako odluka nije pokrivena ovim dokumentom:

1. Odaberi opciju koja je **brža u runtimeu** i **manja u bundleu**
2. Ako je izjednačeno, onu s manje ovisnosti
3. Zabilježi u `DECISIONS.md` s datumom i obrazloženjem u dvije rečenice
4. Nastavi — ne blokiraj

Ako je odluka nepovratna (shema baze, format podataka, `SALT`, format `round_id`) — **stani i pitaj.**

### 11.6 `CLAUDE.md`

Generiraj u fazi 0 kao sažetak za svaku buduću sesiju:

```markdown
# Orbis

Dnevna geografska igra. Puna specifikacija: SPEC.md — pročitaj prije rada.

## Naredbe
pnpm dev · pnpm data · pnpm check · pnpm build · pnpm worker:dev

## Nepromjenjivo
- SALT u engine/seed.ts je 'orbis-v1' — NIKAD ne mijenjati
- Sve vrijeme kroz engine/time.ts (Europe/Zagreb), nikad UTC
- Jedna tekstura za globus, ne mesh po državi
- Boja samo kao informacija — SPEC §2.1
- Zabranjene ovisnosti — SPEC §1
- Liga: 6 prijatelja, tjedna runda, zatvara se petkom 17:00 ili kad svi odigraju

## Prije commita
pnpm check
```

---

## 12. Prva naredba

```bash
pnpm create vite orbis --template react-ts
cd orbis && git init && git branch -M main
```

Zatim faza 0. Kreni.
