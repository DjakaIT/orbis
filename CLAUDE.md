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
- Tri moda: svijet, gradovi, hrvatska — svaki svoj bazen, partija i streak
- Pogodak je identitet mete, NIKAD `km === 0` — matrica je udaljenost među
  granicama, pa je svaki susjed nula kilometara
- Niz meta je permutacija po krugu: u N dana svaka meta dolazi na red jednom

## Prije commita

pnpm check
