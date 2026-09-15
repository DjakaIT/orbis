import { useEffect, useRef } from 'react';

import { distanceRgb } from '../engine/color';
import { drawMap, type MapPoint } from '../render/mapHR';
import { readTokens } from '../render/texture';
import { useGame } from '../state/context';
import styles from './MapHR.module.css';

/**
 * Karta Hrvatske. Canvas 2D — bez WebGL-a gdje ne treba. SPEC §6.2.
 *
 * Crta se u cijelosti pri svakoj promjeni: naselja su točke, a slojeva je
 * nekoliko stotina poteza, pa parcijalno osvježavanje ne bi ništa uštedjelo.
 */
export default function MapHR() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { state, geometry, places } = useGame();

  useEffect(() => {
    const el = canvas.current;
    if (!el || !geometry || !places) return;

    const tokens = readTokens();
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();

    const points: MapPoint[] = state.guesses.flatMap((g) => {
      const place = places[g.id];
      if (!place) return [];
      return [
        {
          name: place.name,
          lat: place.lat,
          lon: place.lon,
          km: g.km,
          color: distanceRgb(g.km, 'hr'),
          hit: g.hit,
        },
      ];
    });

    const targetPlace = state.solved && state.target !== null ? places[state.target] : null;

    const render = (): void => {
      drawMap(el, {
        geometry,
        points,
        target: targetPlace ? { lat: targetPlace.lat, lon: targetPlace.lon } : null,
        tokens,
        ink,
      });
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [state.guesses, state.solved, state.target, geometry, places]);

  return <canvas ref={canvas} className={styles.map} aria-hidden="true" />;
}
