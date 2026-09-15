/**
 * `subset-font` nema tipove, a treba nam samo default izvoz. Minimalna
 * deklaracija je manje koda nego omotač i ne uvlači ovisnost.
 */
declare module 'subset-font' {
  interface Axis {
    min: number;
    max: number;
    default?: number;
  }

  interface Options {
    targetFormat?: 'woff2' | 'woff' | 'truetype' | 'sfnt';
    /** Zadržane osi varijabilnog fonta; raspon min = max znači pinanje. */
    variationAxes?: Record<string, Axis>;
    preserveNameIds?: number[];
  }

  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: Options,
  ): Promise<Buffer>;
}
