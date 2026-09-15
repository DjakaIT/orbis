# Orbis

Dnevna geografska igra. Puna specifikacija: SPEC.md — pročitaj prije rada.

## Naredbe

pnpm dev · pnpm data · pnpm check · pnpm build · pnpm dev:api

## Nepromjenjivo

- SALT u engine/seed.ts je 'orbis-v1' — NIKAD ne mijenjati
- Sve vrijeme kroz engine/time.ts (Europe/Zagreb), nikad UTC
- Jedna tekstura za globus, ne mesh po državi
- Boja samo kao informacija — SPEC §2.1
- Zabranjene ovisnosti — SPEC §1
- Liga: 6 prijatelja, tjedna runda, zatvara se petkom 17:00 ili kad svi odigraju
- Tri moda: svijet, gradovi, hrvatska — svaki svoj bazen, partija i streak
- Pogodak je identitet mete, NIKAD `km === 0` — matrica je udaljenost među
  granicama, pa je svaki susjed nula kilometara
- Niz meta je permutacija po krugu: u N dana svaka meta dolazi na red jednom

## Liga

API je Netlifyjeva funkcija, spremište Netlify Blobs — nema Cloudflarea, nema D1,
nema drugog servisa ni tokena. Odstupanje od SPEC §1, obrazloženo u DECISIONS.md.

- `netlify/lib/app.ts` — `createApp(store)`, sve rute
- `netlify/lib/store.ts` — Blobs ili mapa u memoriji, ista sučelja
- `netlify/functions/api.mts` — ulaz; **sam deklarira `path: '/api/*'`**, u
  `netlify.toml` za API nema pravila i ne smije ga biti
- Vrijeme i bodovanje se **uvoze iz `src/engine`**, nikad ne dupliciraju

## Testovi se ne preskaču

Nijedan test ne smije ovisiti o procesu koji netko mora upaliti. Tako je bug s
ligom i prošao: testovi su tražili pokrenut backend i tiho se preskakali.
`skipIf` je dopušten samo za artefakt koji `pnpm build` napravi (`dist/`).

## Prije commita

pnpm check
