/**
 * mapshaper nema tipove, a treba nam samo `applyCommands`. Minimalna deklaracija
 * je manje koda nego omotač i ne uvlači ovisnost.
 */
declare module 'mapshaper' {
  /** Pokreće mapshaper naredbe nad datotekama u memoriji i vraća izlazne datoteke. */
  export function applyCommands(
    commands: string,
    input: Record<string, string | Buffer>,
  ): Promise<Record<string, Buffer | string>>;

  const mapshaper: { applyCommands: typeof applyCommands };
  export default mapshaper;
}
