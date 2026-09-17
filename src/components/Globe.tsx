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

    /*
     * Zum živi u sceni, koja je imperativna i ne ostavlja traga u DOM-u, pa ga
     * e2e test inače ne može pročitati. Kuka postoji samo u dev buildu —
     * `import.meta.env.DEV` je u produkciji `false` i rolldown cijeli blok
     * izbaci, tako da u isporučenom kodu ovoga nema.
     */
    let tick = 0;
    if (import.meta.env.DEV) {
      const publish = (): void => {
        (window as { __orbisZoom?: number }).__orbisZoom = g.zoomLevel;
        tick = window.setTimeout(publish, 100);
      };
      publish();
    }

    return () => {
      observer.disconnect();
      if (tick) clearTimeout(tick);
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
      // Susjed mete je 0 km i bio bi obojan kao pogodak. SPEC §4.3.
      const color = guess.hit ? readTokens().hit : distanceRgb(guess.km, state.mode);
      // Prvo crtanje nakon refresha ne animira — boja je vec bila ondje.
      if (painted.current.size === state.guesses.length) g.fill(place.code, color);
      else g.paint(place.code, color);
    }

    /*
     * Trag kroz pokusaje, kronoloski. Crta se samo u modu glavnih gradova: ondje
     * je meta tocka pa put od grada do grada nesto znaci, dok su u modu svijet
     * drzave vec obojane i linija bi preko njih bila buka.
     *
     * Redoslijed je onaj kojim je igrac upisivao, ne poredak prikaza — put ima
     * smisla samo kronoloski.
     */
    if (state.mode === 'capitals') {
      const path = [...state.guesses]
        .sort((a, b) => a.ordinal - b.ordinal)
        .flatMap((guess) => {
          const place = places[guess.id];
          return place ? [{ lat: place.lat, lon: place.lon }] : [];
        });
      g.setTrail(path, readTokens().stageInk);
    }

    if (state.solved && state.target !== null) {
      const target = places[state.target];
      if (target) g.centreOn(target.lat, target.lon);
    }
  }, [state.guesses, state.solved, state.target, state.mode, places]);

  return <div ref={host} className={styles.globe} aria-hidden="true" />;
}
