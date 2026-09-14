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
