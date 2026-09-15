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

## 2026-09-14 — Hosting je Netlify, ne Cloudflare Pages

SPEC §1 traži Cloudflare Pages; vlasnik projekta je već na Netlifyju i repo je
ondje spojen (`orbis-urbis`). Odluka je njegova i nadjačava §1.

Praktično se ništa ne gubi: `public/_headers` ima isti format na oba, a `netlify.toml`
dodaje samo ono što Pages radi implicitno — SPA rewrite za `/l/*` i `/v/*`, bez kojeg
bi deep linkovi lige vraćali 404 prije nego aplikacija uopće krene.

**Otvoreno:** API lige ostaje Cloudflare Worker jer je D1 ondje. Netlify ga može
proxyjati (`/api/*` → `workers.dev`), čime sve ostaje na istom originu i CORS-a nema.
Dok Worker nije deployan, liga u produkciji ne radi — igra radi, panel lige javlja
grešku. Alternativa je prepisati API na Netlify Functions, što znači i zamjenu D1.

## 2026-09-14 — CI ostaje u repou, ali se ne čeka

GitHub Actions na ovom računu ne pokreće jobove: „The job was not started because your
account is locked due to a billing issue." To je stanje računa, ne greška u konfiguraciji.

`ci.yml` ostaje jer ga SPEC §10 traži i jer proradi čim se naplata riješi. Do tada je
provjera lokalna i temeljitija nego što bi CI bio: uz `pnpm check` i `pnpm build` svaka
je faza vožena i u pravom pregledniku (Playwright, screenshotovi) te, za ligu, protiv
prave baze kroz miniflare.

## 2026-09-14 — `ALLOWED_ORIGIN` je popis, ne jedna domena

Frontend je na Netlifyju, Worker na `workers.dev`, a Netlify uz produkciju pravi i
deploy preview domene. Jedna vrijednost ne pokriva to, pa se `ALLOWED_ORIGIN` čita kao
popis odvojen zarezom. Kad API ide kroz Netlify proxy, sve je na istom originu i CORS
ionako ne dolazi do izražaja — ovo pokriva izravni poziv na Worker.

## 2026-09-15 — Podskup fonta umjesto punog reza, i pinane osi umjesto varijabilnih

Faza 1 ostavila je font na 185 KB protiv budžeta od 32 KB (SPEC §9.5), uz bilješku
da rješenje ide u fazu 4. `scripts/build-font.ts` sada reže glifove na ono što igra
stvarno ispisuje: sučelje, cijeli ispisivi ASCII i abeceda pročitana iz upravo
generiranih `world-meta.json` i `hr-places.json`. Rezultat je **16,7 KB za sva tri
reza**, ispod budžeta.

SPEC §2.3 traži dvije uloge iste obitelji kroz varijabilne osi. Osi su ovdje sredstvo,
a ne cilj: iste dvije uloge daju dva **pinana** reza uz četvrtinu težine, jer varijabilni
rez nosi delta podatke za svaku os i svaki glif — mjereno 82 KB s punim osima, 63 KB
sa suženima, 16,7 KB pinano. Izgled je isti jer sučelje ionako koristi samo dvije
točke u prostoru osi.

Cijena je da znak izvan podskupa pada na `system-ui`. Za imena iz podataka to ne može
proći neprimijećeno — test u `tests/build/font.test.ts` provjerava svako ime države,
naselja i aliasa te svaki string literal u `src/`, parsiran TypeScriptovim parserom da
hrvatska proza iz komentara ne ulazi u račun. Ostaje slobodan unos nadimaka u ligi:
zato je u rezu cijeli ispisivi ASCII, a znak izvan njega otpada samo sam za sebe.

## 2026-09-15 — Globus je lazy chunk

`three.js` je 126 KB gzipano i najveći pojedinačni trošak glavne dretve pri učitavanju.
Dok se parsira i dok WebGL kreće, sučelja nema. Globus se sada učitava kao zaseban
chunk, isto kao karta Hrvatske od faze 2.

Mjereno kroz Lighthouse, mobilna emulacija: Total Blocking Time **1270 ms → 58 ms**,
Performance **61 → 89**. Okvir scene drži visinu cijelo vrijeme pa CLS ostaje 0 i
globus ne poskakuje kad stigne.

Isprobana je i odgoda montiranja scene za jedan frame nakon prvog iscrtavanja. Nije
promijenila ništa mjerljivo (92 prije i poslije) pa je vraćena — složenost bez dobitka.

## 2026-09-15 — `injectRegister: 'script-defer'` traži eksplicitan `clientsClaim`

Skripta za registraciju service workera ubacivala se u `<head>` kao blokirajuća i sama
koštala 330 ms do prvog iscrtavanja. Uz `injectRegister: 'script-defer'` vite-plugin-pwa
prestaje izvoditi `skipWaiting` i `clientsClaim` iz `registerType: 'autoUpdate'` i
generira service worker **bez `clientsClaim`** — a bez njega prvi posjet nikad nije pod
kontrolom SW-a, pa offline proradi tek iz drugog otvaranja. Oboje se sada postavlja
ručno u `workbox`.

Nalaz je došao iz `tests/e2e/pwa.spec.ts`, koji se jedini vozi na produkcijskom buildu
preko `vite preview`. Lighthouse ovo ne bi prijavio, a u razvoju service workera nema.

## 2026-09-15 — Service worker ne precachea HR podatke

`globPatterns` je povlačio i `hr-places.json` i `hr-outline.json` u precache, pa bi ih
prvi posjet skinuo u pozadini — a kriterij faze 2 (SPEC §10) je da se HR podaci **ne
preuzimaju dok se mod ne odabere**. Sada su na `runtimeCaching` pravilu: dohvate se pri
odabiru moda i od tada su offline. Izbačena je i `og.png`, koju dohvaćaju tuđi
poslužitelji za preview, nikad uređaj igrača. Precache je pao s 1096 na 970 KiB.

## 2026-09-15 — Font se ne ubacuje u CSS kao data URI

Dva manja reza (latin-ext 1,7 KB, display 1,2 KB) padaju ispod Viteovog praga od 4 KB
pa su završila u `index.css` kao base64. To su bajtovi fonta naplaćeni CSS budžetu iz
§9.5, a usput se gubi `immutable` keširanje koje `public/_headers` daje pravim
`.woff2` datotekama. Uz `assetsInlineLimit` koji odbija woff2, CSS je pao s **5,43 KB
na 2,19 KB** gzipano.

## 2026-09-15 — Adresa OG slike dolazi iz okoline builda, ne iz koda

Open Graph traži apsolutni URL; X ga zahtijeva, Facebook i Slack relativni najčešće
razriješe, ali to nigdje nije zajamčeno. Domena se ne upisuje rukom — po istom pravilu
po kojem §4.1 zabranjuje izmišljanje URL-ova izvora — nego se čita iz `URL`, odnosno
`DEPLOY_PRIME_URL` koji Netlify postavlja za deploy preview, pa svaki preview pokazuje
na sebe. Bez ijedne varijable adresa ostaje root-relativna, što je ispravno za
preglednik i za lokalni `pnpm preview`.

## 2026-09-15 — Footer ide s `--t-xs` na `--t-sm`

`--t-xs` je 10,24 px, ispod granice čitljivosti koju Lighthouse mjeri, a footer nosi
atribuciju izvora i jedini ulaz u ligu. Skala tokena iz SPEC §2.2 ostaje netaknuta;
mijenja se samo ova njezina upotreba. Time Best Practices ide sa 96 na 100.

## 2026-09-15 — React ostaje, uz tri zabilježena odstupanja

DECISIONS je u fazi 1 ostavio otvoreno hoće li se runtime zamijeniti Preactom. Obje
opcije su izmjerene na istom buildu:

|                        | React 19 | preact/compat | Cilj   |
| ---------------------- | -------- | ------------- | ------ |
| Lighthouse Performance | 92       | **95**        | ≥ 95   |
| JS bez three.js        | 77,4 KB  | **17,1 KB**   | 45 KB  |
| Prvi load, svijet      | 268 KB   | **~213 KB**   | 250 KB |
| three.js chunk         | 130,3 KB | 130,3 KB      | 85 KB  |

Preact ispunjava sva tri cilja koja React probija, i svih 30 e2e testova prošlo je na
Preact buildu. Odluka je ipak da **React ostaje**, iz dva razloga.

Prvi: SPEC §1 veže stack na React 19 i to je obvezujuće. Drugi, i važniji u praksi:
razlika je 60 KB gzipano na **prvom i jedinom** učitavanju — od drugog posjeta sve
poslužuje service worker iz precachea. Na 4G je to oko desetinke sekunde, jednom.
Igra se ne igra brže ni sporije.

Cijena zamjene nije bila samo alias. `use(GameCtx)` iz Reacta 19 ne postoji u
`preact/compat` (trivijalno se mijenja u `useContext`), ali `@testing-library/react`
povlači pravi `react-dom` i šest unit testova pada dok se ne zamijeni preact verzijom.
Alternativa je da produkcija vozi Preact a testovi React, što znači da se razlike u
ponašanju ne bi vidjele ondje gdje se testira.

**Ostaje otvoreno:** ako se ikad pojavi treći mod ili bitno više UI koda, omjer se
mijenja i ovo treba premjeriti. Brojke iznad su mjerene 2026-09-15 i ponovljive su
kroz `pnpm analyze`.

## 2026-09-15 — Budžeti i Lighthouse nakon faze 4

| Asset                 | Izmjereno (gzip) | Budžet | Bilješka                          |
| --------------------- | ---------------- | ------ | --------------------------------- |
| JS bez three.js       | 77,4 KB          | 45 KB  | react-dom; vidi odluku iznad      |
| three.js chunk        | 130,3 KB         | 85 KB  | `WebGLRenderer`, ne tree-shaka    |
| CSS                   | 3,0 KB           | 6 KB   | ✓ (bilo 5,4 prije data URI-ja)    |
| `world-topo.json`     | 13,0 KB          | 40 KB  | ✓                                 |
| `world-matrix.bin`    | 28,6 KB          | 40 KB  | ✓                                 |
| font woff2            | 16,7 KB          | 32 KB  | ✓ (bilo 185 KB)                   |
| HR podaci, lazy       | 29,8 KB          | 60 KB  | ✓                                 |
| **Prvi load, svijet** | **268 KB**       | 250 KB | razlika je točno zbroj gornja dva |

Lighthouse, mobilna emulacija: **Performance 92** (cilj ≥ 95), **Accessibility 100**,
**Best Practices 100**, **SEO 100**.

Testovi u `tests/build/dist.test.ts` čuvaju svaku od ovih brojki. Gdje je budžet
probijen, test se drži stropa zabilježenog ovdje umjesto da se pravi da je budžet
postignut — probije li se i strop, pada.

## 2026-09-15 — Niz meta je slijed permutacija, ne hash po danu

Traženo: „svaki dan mora biti različit, da se prođu SVE države svijeta". Stari
račun to nije davao. Izmjereno na bazenu od 177: u prvih 177 dana pojavilo se
**119 država**, 58 ih se nije pojavilo nijednom, a neke po tri puta. Ni nakon
dvije godine jedna država nije došla na red.

Uzrok je u samoj metodi: indeks se birao hashom datuma, uz izbjegavanje ponavljanja
unatrag 30 dana. Hash je ravnomjeran u granici, ali ne u konačnom prozoru — nema
ničega što bi jamčilo da svaka meta dođe na red.

Zamjena: niz je slijed krugova kroz cijeli bazen. Svaki krug je Fisher–Yates
permutacija sijana iz `${mode}:${SALT}:${cycle}`, pa u `N` dana svaka meta dolazi
točno jednom. Nakon toga: 177 od 177, svaka jednom.

`SALT` i `EPOCH` su nepromijenjeni, ali **niz meta jest drugi** — kao i pri
prethodnoj promjeni, to ništa ne lomi jer još nije u pogonu, a nakon puštanja u
rad se više ne smije dirati.

**Jamstvo od 30 dana i dalje vrijedi, ali samo iznad granice.** Unutar kruga
ponavljanja nema po konstrukciji; jedini rizik je prijelaz, pa se prvih 30 mjesta
novog kruga očisti od svega što je bilo u zadnjih 30 dana prethodnog. Rep se čita
iz **podešenog** poretka prethodnog kruga — prva verzija čitala ga je iz sirovog i
test s bazenom od 60 odmah je našao razmak od 21 dana.

Ispod `2 × 30` mjesta jamstvo se kosi samo sa sobom: da svaka meta dođe na red
jednom u `N` dana a razmak ostane veći od 30, nijedna se ne bi smjela pomaknuti
unaprijed za više od `N − 30` mjesta — pri `N = 31` to dopušta samo identitet,
dakle isti poredak svaki krug. Ondje pokrivenost pobjeđuje. Stvarni bazeni su 71,
177 i 624; izmjereni najmanji razmak pri 71 je 34 dana.

Usput je nestao hod od epohe do današnjeg dana: krug se računa dijeljenjem, pa je
posao `O(N)` po krugu umjesto `O(dana)`.

## 2026-09-15 — Susjed mete nije pogodak

Prijavljeno iz igre: četiri države istovremeno pokazuju 0 km i oznaku pogotka, pa
se ne vidi koja je točna.

Matrica nosi **minimalnu udaljenost između granica**, kako SPEC §4.3 i traži —
centroidi bi tvrdili da su Rusija i Finska 4 000 km razdvojene iako dijele granicu.
Posljedica je da je svaka susjedna država točno 0 km od mete. Pet mjesta je pogodak
izvodilo upravo iz te nule: oznaka u retku, boja gradijenta, bojanje globusa, karta
Hrvatske i emoji kvadratić u share tekstu.

Provjereno na stvarnim podacima: meta 2026-09-15 je Sjeverna Koreja, a Kina, Južna
Koreja i Rusija sve su na 0 km. Najgori slučaj u bazenu je Kina — **14 država** bi
izgledalo kao pogodak.

Pogodak je sada indeks mete, izveden na jednom mjestu u reduceru i nošen uz svaki
pokušaj kao `hit`. Uz njega idu `neighbour` (nula kilometara, ali nije meta —
smisleno samo u modu svijet, jer su hrvatska naselja točke) i `trend` prema
kronološki prethodnom pokušaju.

Očitanje ispod polja bilo je vidljivo samo čitaču ekrana i govorilo je tek ime i
udaljenost. Sada je vidljivo i kaže što se dogodilo: ime, pa „pogodak" ili
„susjedna država, dijeli granicu s metom" ili udaljenost, pa je li bliže ili dalje
nego prethodni pokušaj. U listi susjed piše „susjedna" umjesto „0 km" i zadržava
strelicu.

## 2026-09-15 — Glavni gradovi su treći mod

Traženo: glavni gradovi kao zasebna igra, nasumično po cijelom svijetu.

**Izvori.** Natural Earth za grad i koordinate, Unicode CLDR za hrvatski naziv —
oba su već u projektu. CLDR vodi nazive gradova kao „exemplar city" uz vremensku
zonu; odatle dolaze Beč, Prag, Varšava, Kopenhagen i Kijev. Preostalih 120 gradova
nema hrvatski egzonim u CLDR-u, zadržavaju izvorni naziv i popisani su u
`scripts/MISSING_CAPITALS_HR.md`, kako §4.2 propisuje.

**Spoj je trebao pažnju.** Polje `TIMEZONE` iz Natural Eartha je u 110m sloju
neispravno — Prag ondje nosi `America/Chicago`, Moskva ništa — pa se zona traži po
zadnjem segmentu imena zone, kroz `NAME`, `NAME_EN`, `NAMEASCII` i `NAMEALT`. Bez
sva četiri ispadnu Kopenhagen (jer je `NAME` = København) i Kijev (jer je zona još
uvijek `Europe/Kiev`).

**Četiri države ispadaju umjesto da se pogađa.** Južnoafrička Republika ima tri
ustavne prijestolnice, a Bolivija, Obala Bjelokosti i Mjanmar razdvojeno de jure i
de facto sjedište. Dvojben odgovor u kvizu je gori od nikakvog — isto načelo po
kojem se broj stanovnika ne procjenjuje. Još devet nema suvereni glavni grad
(Antarktika, prekomorski teritoriji, sporna područja). Bazen je 164, iznad granice
od 60 koju traži jamstvo od 30 dana.

**Mod ne donosi novu mehaniku.** Gradovi su točke pa je haversine dovoljan i
matrica ne treba, a globus boji državu kojoj pogođeni grad pripada, jer svaki grad
nosi ISO kod svoje države. Podaci se učitavaju tek pri odabiru moda i nisu u
precacheu, isto kao hrvatski.

**Pohrana ostaje `v: 1`.** Shema samo dobiva polje; podizanje verzije obrisalo bi
sve postojeće streakove, što SPEC §8 izričito zabranjuje. Liga je trebala pravu
migraciju: SQLite ne zna izmijeniti `CHECK` ograničenje, pa `0002_capitals_mode.sql`
gradi tablicu `scores` ispočetka i prepisuje podatke.

**Otvoreno:** svjetski mod i mod gradova biraju metu neovisno, pa se otprilike
jednom u 164 dana može dogoditi da je meta dana Japan, a meta gradova Tokio.
Vezanje ta dva niza značilo bi da čista funkcija `dailyTarget` mora znati koji
indeks pripada kojoj državi; za dobitak od dva dana godišnje to nije zamjena
vrijedna složenosti.

## 2026-09-15 — Gradijent ide drugim smjerom oko kruga

Odluka iz faze 1 zabilježila je da gradijent prolazi kroz zelenu boje `--hit` na
oko 10 700 km, uz napomenu: ako se u igri pokaže zbunjujuće, najmanji zahvat je
povesti ton drugim smjerom.

Pokazalo se. Na globusu u modu gradova Meksiko je na nekoliko tisuća kilometara
bio zelen dovoljno da izgleda kao pogodak, a zemljana paleta je to izoštrila jer
je i kopno sada zeleno.

Ton sada ide od 28° prema −100°, što je isti kraj kao 260° samo s druge strane
kruga: crvena → ružičasta → ljubičasta → indigo. Krajevi su i dalje oni iz SPEC
§5.5; mijenja se put između njih, i zelene na njemu nema. Test prolazi cijelim
rasponom u sva tri moda i traži da svaka točka ostane barem 60° od tona `--hit`.

## 2026-09-15 — Izvor granica je Natural Earth 50m, ne 110m

Prijavljeno iz igre: Andora se ne može pogoditi. Provjereno — nije je bilo u bazenu,
kao ni Monaka, San Marina, Lihtenštajna, Malte, Singapura, Vatikana, Nauru, Tuvalua,
Maldiva ni Barbadosa.

Uzrok je rezolucija izvora. **110m je najgrublji sloj Natural Eartha i male države
iz njega jednostavno ispadnu** — ima 177 zapisa, 50m ima 242. Ništa nije puklo ni
javilo grešku; tih država naprosto nije bilo. Izvor je sada 50m.

**Filtar je promijenjen iz „ima ISO kod" u „vlada sama sobom".** Prije su u bazenu
bili i teritoriji — Portoriko, Guam, Grenland, Bermudi — koji nisu odgovor na pitanje
„koja je država". Kriterij je `SOVEREIGNT === ADMIN`. NE-ovo polje `TYPE` za ovo ne
valja: Izrael je ondje `Disputed`, a Kazahstan i Kuba `Sovereignty`, pa bi filtar po
njemu izbacio tri prave države. Antarktika je izuzeta imenom — jedina je koja prolazi
filtar a nema ni stanovništvo ni glavni grad.

Bazen je **199 država** umjesto 177. Glavni gradovi su usput narasli sa 164 na 192,
jer su gradovi mikrodržava cijelo vrijeme bili u izvoru — samo ih popis država nije
imao na što spojiti.

**Cijena.** Pojednostavljivanje je pojačano s 8% na 5%, jer 50m nosi puno više
točaka: tekstura globusa je 2048 px široka, gdje jedan piksel pokriva oko 19 km na
ekvatoru, pa se gušće ionako ne vidi. Mjereno, 8% daje 33,6 KB gzipano, 5% daje 27,9.

| Asset              | Prije   | Sada    | Budžet |
| ------------------ | ------- | ------- | ------ |
| `world-topo.json`  | 13,0 KB | 27,9 KB | 40 KB  |
| `world-matrix.bin` | 28,6 KB | 36,4 KB | 40 KB  |
| Prvi load, svijet  | 268 KB  | 292 KB  | 250 KB |

Oba podatkovna budžeta i dalje drže. Prvi load je probijen i prije ovoga; +24 KB je
cijena toga da igra sadrži svaku državu svijeta, i to je razmjena koju vrijedi platiti.

**Posljedica:** niz meta je opet drugi, jer se bazen promijenio. Kao i prije, ništa
ne lomi dok igra nije u pogonu — nakon puštanja u rad bazen se više ne smije mijenjati
bez svjesne odluke, jer pomiče sve mete.

## 2026-09-15 — Svijetla tema: papir za stranicu, tamna scena za globus

Traženo: svjetlija tema i ugodniji UX, uz priloženi `apple-design` vodič.

**Dvije podloge, ne jedna.** Stranica je topli papir, ali globus i karta ostaju u
svojoj tamnoj sceni — zaobljenoj plohi sa sjenom, položenoj na papir. Razlog nije
estetski nego mjerljiv: karta Hrvatske crta se na prozirnom canvasu i njezini
natpisi koriste tintu, pa bi na svijetloj podlozi tamnozeleno kopno i tamni natpis
pali jedno na drugo. Scena zadržava odnose koji su ondje već radili.

Tokeni su zato podijeljeni: stranica ima `--paper`, `--surface`, `--rule`, `--ink*`;
scena ima `--stage`, `--ocean`, `--landmass`, `--hairline`, `--stage-ink`. Prije je
jedan `--hairline` služio i kao graticula na globusu i kao razdjelnik u sučelju.

**Gradijent udaljenosti ima dvije skale svjetline.** Ton i zasićenje nose podatak
jednako na obje podloge; mijenja se samo svjetlina, jer ista boja ne može biti
čitljiva i na tamnom oceanu i na svijetlom papiru. Mjereno prema pragu 3:1 iz WCAG
1.4.11: scena 0.78 → 0.56 drži najmanje 3.5:1, papir 0.64 → 0.40 drži 3.4:1.

Usput je zatvorena i starija rupa: raspon 0.78 → 0.44 padao je na **2.1:1** na
dalekom kraju — indigo se gubio u oceanu i prije nego što je tema postala svijetla.

**Zaobljenja odstupaju od SPEC §2.2.** Ondje je `--radius: 2px`, uz obrazloženje
„instrument, ne kartica". To je bilo točno dok je sve bilo tamno i odvojeno tankim
linijama. Na papiru plohu odvaja zaobljenje i sjena, pa oštar kut djeluje kao greška
a ne kao namjera. Skala je sada 6 / 10 / 14 px i pill za segmente.

**Iz `apple-design` vodiča primijenjeno:**

- Odziv ide na pritisak, ne na otpuštanje — `:active` na svakom gumbu, 100 ms.
- Modovi i razina su segmentirani kontroleri: odabrano pluta iznad udubljene staze,
  pa se odnos vidi bez čitanja i boja ostaje slobodna za podatak.
- Zaglavlje je prozirni sloj sa zamućenjem i rub se topi u gradijentu umjesto tvrde
  linije — sadržaj klizi ispod njega.
- Prijedlozi izlaze iz polja: `transform-origin` je na rubu uz koji se otvaraju.
- Razmak slova ovisi o veličini: naslovi stisnuti (−0.01em), sitan tekst blago
  razmaknut (+0.01em), tijelo na nuli. Jedna vrijednost za sve je negdje kriva.
- Tri neovisna signala umjesto jednog: `prefers-reduced-motion`,
  `prefers-reduced-transparency` i `prefers-contrast`, svaki sa svojim ponašanjem.
  Čuva ih `tests/e2e/a11y.spec.ts`, koji mjeri izračunati stil — `@media` pravilo
  koje ništa ne radi inače prolazi neprimijećeno.

**Cijena.** Lighthouse Performance je 87–90 umjesto 91; razlika je geometrija iz
50m izvora, ne tema. Accessibility, Best Practices i SEO ostaju 100.
