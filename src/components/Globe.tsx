import { useEffect, useRef } from 'react';

import { distanceRgb } from '../engine/color';
import { Globe as GlobeScene } from '../render/globe';
import { readTokens } from '../render/texture';
import { useGame } from '../state/context';
import styles from './Globe.module.css';

/**
 * Globus je heroj — sve ostalo je ocitanje instrumenta ispod njega. SPEC §2.1.
 *
 * Scena je imperativna i zivi izvan Reacta; ovdje se samo drzi host element i
 * guraju promjene stanja u nju.
 */
export default function Globe() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<GlobeScene | null>(null);
  const painted = useRef(new Set<number>());

  const { state, shapes, places } = useGame();

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const g = new GlobeScene(el, readTokens());
    scene.current = g;
    painted.current = new Set();

    const observer = new ResizeObserver(() => {
      g.resize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      g.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    if (shapes) scene.current?.setShapes(shapes);
  }, [shapes]);

  useEffect(() => {
    const g = scene.current;
    if (!g || !places) return;

    for (const guess of state.guesses) {
      if (painted.current.has(guess.id)) continue;
      const place = places[guess.id];
      if (!place) continue;

      painted.current.add(guess.id);
      const color = guess.km === 0 ? readTokens().hit : distanceRgb(guess.km, state.mode);
      // Prvo crtanje nakon refresha ne animira — boja je vec bila ondje.
      if (painted.current.size === state.guesses.length) g.fill(place.code, color);
      else g.paint(place.code, color);
    }

    if (state.solved && state.target !== null) {
      const target = places[state.target];
      if (target) g.centreOn(target.lat, target.lon);
    }
  }, [state.guesses, state.solved, state.target, state.mode, places]);

  return <div ref={host} className={styles.globe} aria-hidden="true" />;
}
