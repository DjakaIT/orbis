/**
 * Prirodna podloga globusa: more s dubinom, kopno s klimom, ledene kape.
 *
 * SPEC §6.1 predviđa plosnate boje — jedan ton za more, jedan za kopno. Vlasnik
 * projekta je tražio globus „sa pravom teksturom, kao onaj koji se ima doma", pa
 * je podloga sada slikana. Rastera nema: Natural Earth ovdje daje samo vektore,
 * a URL se ne izmišlja (SPEC §4.1). Sve što se vidi izvedeno je iz istih granica
 * koje se ionako crtaju, plus dvije jednostavne fizike — udaljenost od obale i
 * geografska širina.
 *
 * **Podloga je namjerno prigušena.** Boja u ovoj igri je podatak (SPEC §2.1), a
 * fotografski živ planet bi se s njom natjecao. Zato je paleta stisnuta u uzak
 * raspon svjetline: dovoljno da se čita kao Zemlja, premalo da nadglasa
 * pogođenu državu. Granice tog raspona mjeri `tests/styles/contrast.test.ts`.
 */

/**
 * Podloga se slika na četvrtini površine pa razvlači.
 *
 * Klima i dubina su niskofrekventne — nema detalja koji bi preživio smanjenje,
 * a transformacija udaljenosti na 2048 × 1024 košta četiri puta više. Granice i
 * mreža se i dalje crtaju u punoj rezoluciji, preko ovoga.
 */
export const BASE_W = 1024;
export const BASE_H = 512;

/** Koliko je piksela širok pojas plićaka, na BASE_W. */
const SHELF = 7;
/** Iza koliko piksela od obale more više ne tamni. */
const ABYSS = 46;
/** Iza koliko piksela od obale je kopno posve kontinentalno. */
const INLAND = 20;

type Rgb = [number, number, number];

export interface BaseColors {
  /** Plićak uz obalu — najsvjetlija voda, i ona koju mjere testovi kontrasta. */
  shelf: Rgb;
  /** Otvoreno more. */
  abyss: Rgb;
  /** Vlažno kopno: šuma, livada. */
  verdant: Rgb;
  /** Suho kopno: stepa, pustinja. Najsvjetlije kopno koje igrač može pogoditi. */
  arid: Rgb;
  /** Hladno kopno: tundra, tajga. */
  boreal: Rgb;
  /** Led: Grenland i Antarktika. Nijedno nije u bazenu meta. */
  ice: Rgb;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Determinističan šum iz cijelih koordinata, u [0, 1). */
function hash2(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Glatki šum: bilinearna interpolacija rešetke. */
function noise(x: number, y: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  // Smoothstep: bez ublažavanja se vidi rešetka iz koje šum dolazi.
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);

  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Tri oktave: krupne mrlje, pa sitnije, pa zrno. */
function fbm(x: number, y: number): number {
  return noise(x, y, 34) * 0.55 + noise(x, y, 13) * 0.3 + noise(x, y, 5) * 0.15;
}

/**
 * Šum se računa na pola gustoće pa se očitava s međuvrijednostima.
 *
 * Dvanaest hashiranja po pikselu je bilo najskuplje u cijeloj podlozi. Najsitnija
 * oktava ima korak od pet piksela, pa uzorkovanje na svaki drugi ne gubi ništa
 * što se može vidjeti — a posla je četiri puta manje.
 */
function noiseField(w: number, h: number): (x: number, y: number) => number {
  const cw = (w >> 1) + 2;
  const ch = (h >> 1) + 2;
  const field = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) field[y * cw + x] = fbm(x * 2, y * 2);
  }

  return (x, y) => {
    const fx = x / 2;
    const fy = y / 2;
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const i = y0 * cw + x0;
    const a = field[i]!;
    const b = field[i + 1]!;
    const c = field[i + cw]!;
    const d = field[i + cw + 1]!;
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/**
 * Udaljenost svakog piksela do najbližeg piksela druge vrste, u pikselima.
 *
 * Dvoprolazni chamfer s kernelom 3–4: jedan prolaz naprijed, jedan natrag.
 * Griješi oko pola postotka, a nad pola milijuna piksela je red veličine brži od
 * egzaktnog. Po x se ne omotava; greška je time zatvorena u Pacifik uz ±180°,
 * gdje se udaljenost ionako davno zasitila.
 */
export function distanceField(
  mask: Uint8Array,
  w: number,
  h: number,
  inside: number,
): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === inside ? INF : 0;

  const at = (i: number, dx: number, dy: number, cost: number): number =>
    d[i + dy * w + dx]! + cost;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let best = d[i]!;
      if (y > 0) {
        best = Math.min(best, at(i, 0, -1, 3));
        if (x > 0) best = Math.min(best, at(i, -1, -1, 4));
        if (x < w - 1) best = Math.min(best, at(i, 1, -1, 4));
      }
      if (x > 0) best = Math.min(best, at(i, -1, 0, 3));
      d[i] = best;
    }
  }

  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let best = d[i]!;
      if (y < h - 1) {
        best = Math.min(best, at(i, 0, 1, 3));
        if (x < w - 1) best = Math.min(best, at(i, 1, 1, 4));
        if (x > 0) best = Math.min(best, at(i, -1, 1, 4));
      }
      if (x < w - 1) best = Math.min(best, at(i, 1, 0, 3));
      d[i] = best;
    }
  }

  // Kernel računa u trećinama piksela.
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

/**
 * Boja jednog piksela kopna.
 *
 * Tri ulaza, nijedan izmišljen: širina nosi temperaturu, udaljenost od obale
 * kontinentalnost, a šum razbija pojaseve da ne izgledaju kao pruge.
 *
 * Suhoća je umnožak pojasa oko 25° — ondje leže Sahara, Arabija, Kalahari i
 * australska unutrašnjost — i kontinentalnosti. Bez tog drugog člana pustinja bi
 * pala i na Floridu i na jug Kine, koji su na istoj širini ali uz more.
 */
export function landColor(lat: number, inland: number, n: number, c: BaseColors): Rgb {
  const abs = Math.abs(lat);

  const belt = Math.exp(-((abs - 25) ** 2) / (2 * 10 ** 2));
  const arid = clamp01(belt * (0.25 + 0.75 * inland) + 0.3 * inland - 0.25 + (n - 0.5) * 0.45);

  // Ekvatorijalni pojas je vlažan bez obzira na kontinentalnost.
  const tropical = clamp01(1 - abs / 14);
  let rgb = mix(c.verdant, c.arid, clamp01(arid * (1 - tropical)));

  // Iznad 46° kopno prelazi u tajgu pa tundru.
  rgb = mix(rgb, c.boreal, clamp01((abs - 46) / 22));

  // Svjetlina se blago mreška, da ploha ne izgleda kao izrezan papir.
  const shade = 0.93 + (n - 0.5) * 0.16;
  return [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
}

/**
 * Slika podlogu preko cijelog `ctx`, koji mora biti BASE_W × BASE_H.
 *
 * `land` je maska kopna (1 = kopno), `ice` maska trajnog leda. Obje dolaze
 * rasterizirane iz istih geometrija koje se ionako crtaju.
 */
export function paintNatural(
  ctx: CanvasRenderingContext2D,
  land: Uint8Array,
  ice: Uint8Array,
  c: BaseColors,
): void {
  const w = BASE_W;
  const h = BASE_H;

  const depth = distanceField(land, w, h, 0);
  const inland = distanceField(land, w, h, 1);
  const grain = noiseField(w, h);

  const img = ctx.createImageData(w, h);
  const px = img.data;

  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;

    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const n = grain(x, y);

      let rgb: Rgb;
      if (land[i] === 1) {
        rgb = landColor(lat, clamp01(inland[i]! / INLAND), n, c);
        /*
         * Led ne ovisi o širini nego o podacima: Grenland i Antarktika dolaze
         * kao maska. Rub se rastapa preko par piksela da kapa nema oštar rez.
         */
        if (ice[i] === 1) rgb = mix(rgb, c.ice, clamp01(inland[i]! / 3));
      } else {
        // Plićak je uz obalu, otvoreno more tamni do zasićenja na ABYSS.
        const t = clamp01((depth[i]! - SHELF) / (ABYSS - SHELF));
        // Korijen: prijelaz je brz uz obalu pa se smiruje, kao na pravoj karti.
        rgb = mix(c.shelf, c.abyss, Math.sqrt(t));
        if (ice[i] === 1) rgb = mix(rgb, c.ice, 0.75);
        const ripple = 0.96 + (n - 0.5) * 0.08;
        rgb = [rgb[0] * ripple, rgb[1] * ripple, rgb[2] * ripple];
      }

      px[o] = rgb[0];
      px[o + 1] = rgb[1];
      px[o + 2] = rgb[2];
      px[o + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}
