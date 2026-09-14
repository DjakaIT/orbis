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

## 2026-09-14 — Izbjegavanje ponavljanja meta odstupa od koda u SPEC §5.2

Kod u SPEC-u gradi prozor „zadnjih 30 dana" od **sirovih** indeksa prethodnih dana, a
ne od stvarno objavljenih; kad avoidance petlja pomakne metu, taj pomaknuti indeks
nikad ne ude u prozor. Test je odmah nasao ponavljanje na razmaku od deset dana
(2026-03-21 i 2026-03-31 pri bazenu od 177), sto je upravo ono sto §5.2 zabranjuje.

Zamjena: niz se razrjesava unaprijed od fiksne epohe `2026-01-01`, uz klizni prozor
stvarno objavljenih meta. Racun ostaje cist i deterministican — ne ovisi o lokalnoj
povijesti igraca — pa svi klijenti za isti dan i dalje dobiju isti indeks, a jamstvo
od 30 dana sada stvarno vrijedi. Cijena je hod od epohe do danasnjeg dana, memoiziran,
mjereno ispod 500 ms i deset godina nakon epohe.

**Posljedica:** `EPOCH` je time postao jednako nepromjenjiv kao `SALT` — pomak bi
razbacao sve mete. Niz meta razlikuje se od onoga koji bi dao doslovni SPEC kod;
buduci da jos nista nije u pogonu, to nista ne lomi, ali nakon pustanja u rad vise
se ne smije dirati.

## 2026-09-14 — Filtar drzava odstupa od SPEC §4.2

`-filter 'ISO_A3 !== "-99"'` iz SPEC-a izbacuje pet zapisa, medu njima
**Francusku i Norvesku** — u Natural Earthu obje imaju `ISO_A3 = -99` — i ostavlja
172 drzave umjesto 177 koliko §4.3 ocekuje u `world-meta.json`. Pipeline zato uzima
`ISO_A3_EH` kad je valjan, a inace `ADM0_A3`; tako prolaze sve 177 s jedinstvenim
kodovima, ukljucujuci Kosovo (KOS), Sj. Cipar (CYN) i Somaliland (SOL).

## 2026-09-14 — Hrvatski nazivi drzava iz CLDR-a, ne rucno

SPEC §4.2 trazi rucno provjerenu mapu ISO3 → hrvatski naziv. Umjesto pisanja iz
glave, nazivi se citaju iz `cldr-localenames-full` (Unicode CLDR, locale `hr`) —
to je izvor, a ne procjena, i pokriva 175 od 177 drzava. Preostale dvije (Sj. Cipar,
Somaliland) zadrzavaju izvorni naziv i zapisane su u `scripts/MISSING_HR.md`, tocno
kako §4.2 propisuje za nesigurne egzonime. Paket je devDependency i ne ide u bundle.

## 2026-09-14 — Poredak drzava sortiran po ISO kodu

Indeks u bazenu odreduje koja je meta kojeg dana, a Natural Earth ne jamci redoslijed
zapisa izmedu izdanja. Bez stabilnog poretka svaki bi `pnpm data` mogao pomaknuti sve
mete, pa se popis sortira po ISO kodu prije dodjele indeksa.

## 2026-09-14 — Matrica se zapisuje kao gornji trokut

Puni N*N niz je 61 KB sirovo i 57 KB gzipano — Uint16 vrijednosti su visoke entropije
pa gzip gotovo ne pomaze, a budzet iz SPEC §9.5 je 40 KB. Matrica je simetricna s
nulama na dijagonali, pa se zapisuje samo gornji trokut: 30 KB sirovo, 29 KB gzipano.
Klijent ga pri ucitavanju jednom razvije u puni niz, da cijena po pogotku ostane
jedan pristup nizu kako §4.3 trazi. Razdvajanje na bajtne ravnine stedjelo bi jos
1,6 KB i nije vrijedno slozenosti.
