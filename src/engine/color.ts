/**
 * Gradijent udaljenosti. SPEC §5.5.
 *
 * Ovo je jedina zasićena boja u aplikaciji — sve ostalo je desaturirani chrome,
 * pa svaki obojani piksel izvan ovoga krade signal od podatka. SPEC §2.1.
 */

import type { Mode } from './seed';

/** Najveća smislena udaljenost po modu; iznad toga gradijent je zasićen. */
const MAX_KM: Record<Mode, number> = { world: 20000, capitals: 20000, hr: 400 };

interface Lch {
  l: number;
  c: number;
  h: number;
}

/**
 * Podloga na kojoj boja završi. Ton i zasićenje nose podatak jednako na obje;
 * mijenja se samo svjetlina, jer ista boja ne može biti čitljiva i na tamnom
 * oceanu i na svijetlom papiru.
 *
 * Mjereno prema WCAG pragu od 3:1 za grafiku: na sceni raspon 0.78 → 0.56 drži
 * najmanje 3.5:1 po cijeloj skali, na papiru raspon 0.64 → 0.40 drži 3.4:1.
 * Prijašnjih 0.78 → 0.44 palo je na 2.1:1 na dalekom kraju — indigo se gubio u
 * oceanu, i to je bila tiha rupa i prije prelaska na svijetlu temu.
 */
export type Surface = 'stage' | 'paper';

const LIGHTNESS: Record<Surface, { from: number; to: number }> = {
  stage: { from: 0.78, to: 0.56 },
  paper: { from: 0.64, to: 0.4 },
};

/**
 * Odvojena skala za Hrvatsku je nužna: na svjetskoj skali cijela Hrvatska
 * bila bi jedna te ista crvena.
 */
function ramp(km: number, mode: Mode, surface: Surface): Lch {
  const t = Math.min(Math.max(km, 0) / MAX_KM[mode], 1);
  const { from, to } = LIGHTNESS[surface];
  return {
    l: from - t * (from - to), // blizu = svjetlije
    c: 0.2 - t * 0.09, // blizu = zasićenije
    /*
     * Ton ide od 28° prema −100°, što je isti kraj kao 260° samo s druge strane
     * kruga: crvena → ružičasta → ljubičasta → indigo. Krajevi su oni iz SPEC
     * §5.5; mijenja se put između njih.
     *
     * Suprotni smjer prolazi kroz zelenu na 152°, a to je točno boja `--hit`.
     * Na globusu je izgledalo kao da je pogođena i država udaljena tisućama
     * kilometara — što je izravno protiv teze §2.1 da je pogodak jedina zelena
     * na ekranu. DECISIONS.md je taj rizik zabilježio još u fazi 1, s ovim
     * zahvatom kao najmanjim popravkom; zemljana paleta ga je izoštrila jer je
     * i kopno sada zeleno.
     */
    h: (((28 - t * 128) % 360) + 360) % 360,
  };
}

/**
 * CSS boja za udaljenost. Pogodak vraća token `--hit`.
 *
 * `hit` dolazi iz identiteta mete, nikad iz `km === 0` — matrica nosi udaljenost
 * između granica, pa su sve susjedne države nula kilometara daleko.
 */
export function distanceColor(km: number, mode: Mode, hit = false): string {
  if (hit) return 'var(--hit)';
  // Sučelje je na papiru; scena ima svoju skalu, vidi `distanceRgb`.
  const { l, c, h } = ramp(km, mode, 'paper');
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/**
 * Ista boja kao `distanceColor`, ali kao `rgb()` — Canvas 2D ne prima `oklch`
 * pouzdano u svim preglednicima, a tekstura globusa se crta upravo na canvasu.
 */
export function distanceRgb(km: number, mode: Mode): string {
  // Canvas je uvijek unutar tamne scene — globus i karta Hrvatske.
  const { l, c, h } = ramp(km, mode, 'stage');
  return oklchToRgb(l, c, h);
}

const toSrgb = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

const clamp255 = (x: number): number => Math.max(0, Math.min(255, Math.round(x * 255)));

/**
 * OKLCh → sRGB. Koeficijenti su Björn Ottossonova matrica OKLab→LMS→linearni sRGB.
 * Boje izvan sRGB gamuta se odsijecaju po kanalu.
 *
 * Zapis je sa zarezima, ne razmacima. Canvas 2D prihvaća oba, ali three.js parsira
 * boju vlastitim regexom koji traži zareze — bez njih tiho vrati bijelu, pa je
 * trag na globusu bio bijel umjesto u boji udaljenosti.
 */
export function oklchToRgb(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;

  const r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  return `rgb(${String(clamp255(toSrgb(r)))}, ${String(clamp255(toSrgb(g)))}, ${String(clamp255(toSrgb(bl)))})`;
}

/**
 * Kvadratić za share tekst — udaljenost mapirana na najbliži emoji. SPEC §7.6.
 *
 * Zelena je rezervirana za pogodak. Da je i najbliži promašaj zelen, iz grida se
 * ne bi vidjelo gdje je partija zapravo završila.
 */
const SQUARES = ['🟨', '🟧', '🟪', '🟦'] as const;

export function distanceSquare(km: number, mode: Mode, hit = false): string {
  if (hit) return '🟩';
  const t = Math.min(Math.max(km, 0) / MAX_KM[mode], 1);
  const i = Math.min(SQUARES.length - 1, Math.floor(t * SQUARES.length));
  return SQUARES[i] ?? '🟦';
}
