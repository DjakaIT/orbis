import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  clearDeepLink,
  closedRounds,
  createLeague,
  createPlayer,
  joinLeague,
  leagueView,
  me as fetchMe,
  readDeepLink,
  submitScore,
} from '../../league/client';
import type { ClosedRound, LeagueView } from '../../league/types';
import { now } from '../../engine/time';
import { useGame } from '../../state/context';
import { load, patch } from '../../state/persist';
import type { Player } from '../../types';
import CreateLeague from './CreateLeague';
import JoinLeague from './JoinLeague';
import Onboard from './Onboard';
import RoundSummary from './RoundSummary';
import Standings from './Standings';
import styles from './League.module.css';

interface LeagueSnapshot {
  view: LeagueView;
  last: ClosedRound | null;
}

/** Ljestvica i zadnja zatvorena runda. Ne dira stanje — pozivatelj odlucuje. */
async function fetchLeague(token: string, code: string): Promise<LeagueSnapshot> {
  const view = await leagueView(token, code);
  // Zatvorena runda se prikazuje kao sazetak dok je svjeza. SPEC §7.3.
  const history = await closedRounds(token, code);
  return { view, last: history.rounds[0] ?? null };
}

/**
 * Liga: privatna, za šestero ljudi koji se poznaju. SPEC §7.1.
 *
 * Cijeli tok je jedan panel — prijava, otvaranje ili pridruživanje, pa ljestvica.
 * Deep link `/l/:code` vodi ravno u prijavu s imenom lige, `/v/:token` vraća
 * identitet na drugom uređaju.
 */
export default function League() {
  const { state } = useGame();

  const [player, setPlayer] = useState<Player | null>(() => load().player);
  const [code, setCode] = useState<string | null>(() => load().lastLeagueCode);
  const [view, setView] = useState<LeagueView | null>(null);
  const [lastRound, setLastRound] = useState<ClosedRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);

  const submitted = useRef(new Set<string>());

  const fail = useCallback((err: unknown) => {
    setError(err instanceof ApiError || err instanceof Error ? err.message : 'Nešto je puklo');
  }, []);

  /* -------------------------------------------------------- deep linkovi */

  // Deep link je vanjsko stanje dostupno već pri prvom renderu, ne nešto što
  // treba dohvaćati — čita se u inicijalizatoru, a efekt ga samo briše iz URL-a.
  const [link] = useState(readDeepLink);

  useEffect(() => {
    if (link) clearDeepLink();
  }, [link]);

  useEffect(() => {
    if (link?.kind !== 'recover') return;

    // Povrat identiteta: token iz linka postaje token ovog uređaja. SPEC §7.2.
    const alive = { current: true };
    void (async () => {
      try {
        const who = await fetchMe(link.value);
        if (!alive.current) return;
        const restored: Player = { id: who.player_id, token: link.value, nickname: who.nickname };
        const first = who.leagues[0]?.code ?? null;
        patch({ player: restored, lastLeagueCode: first });
        setPlayer(restored);
        setCode(first);
      } catch (err) {
        if (alive.current) fail(err);
      }
    })();

    return () => {
      alive.current = false;
    };
  }, [link, fail]);

  /* ------------------------------------------------------------ ljestvica */

  const apply = useCallback((data: LeagueSnapshot) => {
    setView(data.view);
    setLastRound(data.last);
    setError(null);
  }, []);

  useEffect(() => {
    if (!player || !code) return;
    const alive = { current: true };

    void (async () => {
      try {
        const data = await fetchLeague(player.token, code);
        if (alive.current) apply(data);
      } catch (err) {
        if (alive.current) fail(err);
      }
    })();

    return () => {
      alive.current = false;
    };
  }, [player, code, apply, fail]);

  /* ------------------------------------------- automatska predaja rezultata */

  useEffect(() => {
    if (!player || !state.solved || state.status !== 'ready') return;

    const key = `${state.date}:${state.mode}`;
    if (submitted.current.has(key)) return;
    submitted.current.add(key);

    void (async () => {
      try {
        await submitScore(player.token, {
          puzzleDate: state.date,
          mode: state.mode,
          guesses: state.guesses.length,
          elapsedMs: now() - state.startedAt,
        });
        // Igrač može igrati i bez lige; tada nema ljestvice za osvježiti.
        if (code) apply(await fetchLeague(player.token, code));
      } catch (err) {
        // Runda zatvorena (409) ili mreža pala: partija je i dalje odigrana.
        if (!(err instanceof ApiError && err.status === 409)) fail(err);
      }
    })();
  }, [
    player,
    code,
    state.solved,
    state.status,
    state.date,
    state.mode,
    state.guesses.length,
    state.startedAt,
    apply,
    fail,
  ]);

  /* --------------------------------------------------------------- radnje */

  async function onNickname(nickname: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const created = await createPlayer(nickname);
      const next: Player = { id: created.player_id, token: created.token, nickname };
      setPlayer(next);
      patch({ player: next });
      // Prikazuje se jednom: link za povrat na drugom uređaju. SPEC §7.2.
      setRecovery(`${globalThis.location.origin}/v/${created.token}`);

      // Dolazak preko /l/:code zavrsava pridruzivanjem cim nadimak postoji.
      if (link?.kind === 'join') {
        await joinLeague(next.token, link.value);
        patch({ lastLeagueCode: link.value });
        setCode(link.value);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(name: string): Promise<void> {
    if (!player) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createLeague(player.token, name);
      setCode(created.code);
      patch({ lastLeagueCode: created.code });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(joinCode: string): Promise<void> {
    if (!player) return;
    setBusy(true);
    setError(null);
    try {
      await joinLeague(player.token, joinCode);
      setCode(joinCode);
      patch({ lastLeagueCode: joinCode });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------- prikaz */

  if (!player) {
    return (
      <Onboard
        joining={link?.kind === 'join'}
        busy={busy}
        error={error}
        onSubmit={(n) => void onNickname(n)}
      />
    );
  }

  return (
    <div className={styles.wrap}>
      {recovery !== null && (
        <p className={styles.recovery}>
          Spremi ovaj link ako promijeniš uređaj:{' '}
          <code className={styles.codeText}>{recovery}</code>
        </p>
      )}

      {view ? (
        <>
          {lastRound && <RoundSummary round={lastRound} name={view.name} />}
          <Standings view={view} meId={player.id} />
        </>
      ) : (
        <>
          <CreateLeague busy={busy} error={error} onSubmit={(n) => void onCreate(n)} />
          <JoinLeague busy={busy} error={error} onSubmit={(c) => void onJoin(c)} />
        </>
      )}
    </div>
  );
}
