-- Orbis liga. SPEC §7.4.

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
