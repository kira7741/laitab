import { encode } from 'uqr';

/** uqr `data` is a 2D array. Index `data[y][x]`, not a flat buffer. */
export function qrMatrix(value: string): { modules: number; dark: number; path: string } {
  const { data, size: modules } = encode(value, { ecc: 'M', border: 2 });
  const commands: string[] = [];
  let dark = 0;
  for (let y = 0; y < modules; y++) {
    const row = data[y];
    for (let x = 0; x < modules; x++) {
      if (row?.[x]) {
        dark += 1;
        commands.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }
  return { modules, dark, path: commands.join('') };
}
