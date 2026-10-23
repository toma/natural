/**
 * Sub-pixel jitter sequences for temporal antialiasing.
 *
 * TAA offsets the projection by a fraction of a pixel each frame and accumulates
 * the results, so the sequence has to cover the pixel evenly. A low-discrepancy
 * Halton(2,3) set does that. Two details matter for a CRISP result:
 *
 *  - The set is centred on the pixel (offsets in [-0.5, 0.5]).
 *  - Its mean is corrected to exactly zero. A raw finite Halton set has a small
 *    non-zero mean, which shifts the converged image a fraction of a pixel off
 *    centre; over a static frame that reads as a soft, slightly displaced image.
 *    Removing the bias keeps edges landing where the geometry actually is.
 *
 * Pure and deterministic, so it is unit-tested without a renderer.
 */

/** Van der Corput radical inverse of `i` in `base`, in [0, 1). */
export function radicalInverse(i: number, base: number): number {
  let f = 1;
  let r = 0;
  let n = Math.max(0, Math.floor(i));
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

/** Halton point for 1-based index `i`, in [0, 1) x [0, 1). */
export function haltonPoint(i: number, baseX = 2, baseY = 3): [number, number] {
  return [radicalInverse(i, baseX), radicalInverse(i, baseY)];
}

/**
 * A TAA jitter sequence in pixels: `count` Halton(baseX, baseY) points centred
 * on the pixel and corrected to exactly zero mean. Each entry is in
 * [-0.5, 0.5].
 */
export function createJitterSequence(count = 16, baseX = 2, baseY = 3): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let mx = 0;
  let my = 0;
  for (let i = 1; i <= count; i += 1) {
    const [hx, hy] = haltonPoint(i, baseX, baseY);
    const x = hx - 0.5;
    const y = hy - 0.5;
    pts.push([x, y]);
    mx += x;
    my += y;
  }
  mx /= count;
  my /= count;
  const clamp = (v: number): number => Math.max(-0.5, Math.min(0.5, v));
  return pts.map(([x, y]) => [clamp(x - mx), clamp(y - my)]);
}
