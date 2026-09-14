# Odluke

Sve gdje SPEC.md nije odlučio ili gdje se od njega odstupilo. Format: datum, odluka,
obrazloženje u dvije rečenice. SPEC §11.5.

## 2026-09-14 — Verzije alata umjesto onih iz SPEC §1

SPEC navodi Vite 6 i TypeScript 5.7; instalirani su Vite 8 i TypeScript 5.9, jer
`pnpm create vite` danas daje te verzije, a svjesno vraćanje na stariji major značilo
bi manje optimizacija i propuštene sigurnosne zakrpe. Stack je nepromijenjen — Vite +
React 19 + TS strict — pa je odstupanje samo u broju verzije.

## 2026-09-14 — TypeScript ostaje na 5.x, ne 7.x

`pnpm add -D typescript` povuklo je TypeScript 7.0, koji `typescript-eslint@8` ne
podržava (peer traži `<6.1.0`) pa typed linting pada. TypeScript je pinan na `^5.9.0`
dok typescript-eslint ne objavi podršku.

## 2026-09-14 — `pnpm build` bez `pnpm data` u fazi 0

SPEC §9.1 definira `build` kao `pnpm data && tsc -b && vite build`, ali
`scripts/build-data.ts` nastaje tek u fazi 1. Do tada je `build` samo `tsc -b && vite build`
kako bi CI bio zelen; `pnpm data` se ulančava u fazi 1, zajedno sa skriptom.

## 2026-09-14 — VitePWA i `manualChunks` odgođeni

`vite.config.ts` iz SPEC §9.2 referencira `three` u `manualChunks` i cijeli PWA manifest.
Three.js dolazi u fazi 1, a PWA je eksplicitno faza 4 (SPEC §10), pa bi oboje sada bila
konfiguracija koja pokazuje na nepostojeće stvari.

## 2026-09-14 — Font probija budžet od 32 KB

`@fontsource-variable/bricolage-grotesque` u `standard` rezu (sve tri osi: opsz, wdth,
wght) ima 131 KB za latin i 54 KB za latin-ext, protiv budžeta od 32 KB iz SPEC §9.5 —
woff2 je već komprimiran pa gzip ne pomaže. Vietnamese rez je izbačen, a stvarno rješenje
je podskup glifova na hrvatski raspon, što ide u fazu 4 uz bundle analizu.

## 2026-09-14 — ESLint pravila za determinizam i vremensku zonu

Self-review liste iz SPEC §11.3 (t. 3 i 4) traže da nigdje ne bude `Math.random()`,
`new Date()` ni `Date.now()` izvan dopuštenih mjesta. Umjesto ručne provjere po PR-u,
`no-restricted-globals` i `no-restricted-properties` to provode u lintu, uz iznimku za
`src/engine/time.ts`, skripte i testove.

## 2026-09-14 — Aplikacija u korijenu workspacea

SPEC §3 stavlja `src/` u korijen repozitorija, a `worker/` kao zaseban paket, pa je
`pnpm-workspace.yaml` naveo samo `worker`. Zbog toga je u `.npmrc` uključen
`ignore-workspace-root-check`, inače pnpm odbija svaku ovisnost aplikacije.

## 2026-09-14 — React sam probija budžet od 45 KB za JS

Prazna ljuska bez ijedne linije logike igre gzipa se na 68.9 KB, protiv budžeta „JS bez
three.js: 45 KB" iz SPEC §9.5 — sve to je `react` + `react-dom`, koji se ne daju stisnuti
ispod ~60 KB. Budžet je time nedostižan uz React 19 iz SPEC §1; ostavljam ga zabilježenim
kao otvoreno pitanje za fazu 4, gdje se uz bundle analizu odlučuje hoće li se podići
brojka ili zamijeniti runtime (npr. Preact preko aliasa).
