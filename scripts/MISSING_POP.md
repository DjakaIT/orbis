# Naselja bez podatka o broju stanovnika

Izostavljeno: **4758** naselja.

DGU Registar prostornih jedinica nije dohvaćen — URL nije stabilan i
`fetch-sources.ts` ispisuje uputu za ručni dohvat. Do tada je GeoNames jedini
izvor populacije, a naselja kojima ondje nedostaje broj stanovnika ispadaju iz
oba bazena.

**Broj stanovnika se ne procjenjuje** — SPEC §4.4. Kad DGU dataset dođe u
`scripts/.cache/`, pipeline ga treba spojiti s ovim popisom po imenu i županiji.
