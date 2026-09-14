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

## 2026-09-14 — `lodash` u stablu, ali ne u bundleu

`pnpm why lodash` vodi na `mapshaper → @ngageoint/geopackage → lodash`. Mapshaper je
devDependency i koristi se samo u `scripts/`, pa lodash nikad ne dode do klijenta —
provjereno grepom po `dist/assets/*.js`. SPEC §1 zabranjuje lodash kao ovisnost
aplikacije; tranzitivna ovisnost build alata nije ista stvar i ne placa se bajtovima.

## 2026-09-14 — Gradijent udaljenosti prolazi kroz zelenu `--hit` boje

Formula iz SPEC §5.5 vodi ton od 28° do 260°, a `--hit` je na 152° — sto znaci da
drzava udaljena oko 10 700 km dobiva gotovo istu zelenu kao pogodak. To se kosi s
tezom iz §2.1 da je pogodak jedina zelena na ekranu.

Formula ostaje kakva jest: eksplicitno je zadana, a pogodak se u praksi razaznaje po
svjetlini (L 0,85 naspram 0,58 na toj udaljenosti), oznaci `✦`, nuli kilometara,
onemogucenom polju i okretanju globusa prema meti. Ako se u igri ipak pokaze zbunjujuce,
najmanji zahvat je povesti ton drugim smjerom — 28° → −100° ≡ 260° — cime se dobiva
crveno → ruzicasto → ljubicasto → indigo, bez zelene. Zabiljezeno da odluka bude svjesna.

## 2026-09-14 — Budzeti iz SPEC §9.5 nakon faze 1

| Asset              | Izmjereno (gzip) | Budzet |
| ------------------ | ---------------- | ------ |
| JS aplikacije      | 77,8 KB          | 45 KB  |
| three.js chunk     | 130,3 KB         | 85 KB  |
| CSS                | 2,1 KB           | 6 KB   |
| `world-topo.json`  | 13,4 KB          | 40 KB  |
| `world-matrix.bin` | 29,3 KB          | 40 KB  |
| font woff2         | 185 KB           | 32 KB  |

Podaci i CSS su ispod budzeta. Tri stavke nisu, i uzroci su poznati: `react` +
`react-dom` su ~60 KB prije ijedne linije igre, `WebGLRenderer` nosi vecinu three.js
chunka i ne da se tree-shakeati dok se crta na WebGL-u, a font se salje u punom latin
rezu. Najveci jedinstveni dobitak je podskup glifova na hrvatski raspon (~150 KB), i
to ide u fazu 4 uz bundle analizu, kako SPEC §10 i predvida.

## 2026-09-14 — DGU nije dohvaćen, GeoNames je izvor populacije

SPEC §4.4 predviđa DGU kao primarni izvor, a GeoNames kao dopunu za broj stanovnika.
`data.gov.hr` API nije vratio upotrebljiv dataset — URL nije stabilan i §4.1 izričito
zabranjuje izmišljanje URL-a — pa je za sada GeoNames jedini izvor, kako §4.1 i predviđa
kao fallback. `fetch-sources.ts` ispisuje uputu za ručni dohvat.

Posljedica: 4 758 naselja bez broja stanovnika ispada iz oba bazena, zabilježeno u
`scripts/MISSING_POP.md`. Broj stanovnika se **ne procjenjuje**.

Iz GeoNames dumpa izbačeni su kodovi `PPLX` (dio naselja — zagrebački „Centar" ima
37 000 stanovnika ali nije naselje), `PPLQ` (napušteno), `PPLW` (razoreno) i `PPLH`
(povijesno). Bez toga bi u igri bili kvartovi i nepostojeća mjesta.

Dobiveno je 71 grad (SPEC očekuje ~60) i 624 mjesta (SPEC očekuje ~250). Kriteriji su
oni iz §4.4 — 5 000 odnosno 800 stanovnika — pa je razlika u procjeni, ne u pravilu.

## 2026-09-14 — Obris Hrvatske ide kroz `-o gj2008`

d3-geo je stariji od RFC 7946 i očekuje vanjski prsten **u smjeru kazaljke na satu**;
RFC propisuje suprotno, i mapshaper po defaultu piše po RFC-u. d3-geo takav poligon
tumači kao cijelu sferu bez Hrvatske: `geoArea` ispadne 12,57 sr umjesto 0,0014,
`fitExtent` se sruši na skalu 0,0038 i karta nestane u jednu točku usred canvasa.

Zastavica `gj2008` u mapshaperovom izlazu zadržava staru konvenciju namotavanja.
Svjetski globus ovo ne dira jer se crta vlastitim ravninskim kodom u `render/texture.ts`,
ne d3-geom.

**Test koji je ovo propustio** provjeravao je samo da su projicirane točke _unutar_
canvasa — a skupljene u središte to i jesu. Sada provjerava i da su Zagreb i Dubrovnik
razmaknuti barem 200 px, te da `geoArea` obrisa ostane ispod 0,01 sr.

## 2026-09-14 — Mod i razina remountaju providera preko `key`

Promjena razine težine u modu Hrvatska otkrila je utrku: efekt koji sprema partiju
okinuo bi se prije nego što se novi bazen učita i žigosao bi staru partiju novom
razinom, pa bi se pokušaji iz „gradova" pojavili u „mjestima" — gdje isti indeksi
označavaju druga naselja.

`mode` i `tier` zato žive u `App` i zajedno čine `key` providera. Remount vraća status
na `loading`, a efekt spremanja ima stražu `status !== 'ready'`, pa prozor za zapis
stale partije više ne postoji.
