-- Treći mod: glavni gradovi.
--
-- `mode` je pod CHECK ograničenjem, a SQLite ga ne zna izmijeniti na mjestu —
-- tablica se gradi ispočetka i podaci se prepišu. Redoslijed je propisan:
-- isključi provjeru stranih ključeva, prepiši, pa vrati indekse.
--
-- Ime i primarni ključ ostaju isti, pa ostatak koda ne zna da se išta dogodilo.

DROP INDEX IF EXISTS idx_scores_round;

CREATE TABLE scores_new (
  player_id   TEXT NOT NULL REFERENCES players(id),
  puzzle_date TEXT NOT NULL,                          -- zagrebački dan
  mode        TEXT NOT NULL CHECK (mode IN ('world','capitals','hr')),
  guesses     INTEGER NOT NULL CHECK (guesses >= 1),
  elapsed_ms  INTEGER NOT NULL,
  round_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, puzzle_date, mode)
);

INSERT INTO scores_new (player_id, puzzle_date, mode, guesses, elapsed_ms, round_id, created_at)
  SELECT player_id, puzzle_date, mode, guesses, elapsed_ms, round_id, created_at FROM scores;

DROP TABLE scores;

ALTER TABLE scores_new RENAME TO scores;

CREATE INDEX idx_scores_round ON scores(round_id, mode);
