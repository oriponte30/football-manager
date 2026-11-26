/** The 1990s money scale: transfer values and wages grow exponentially with ability. */

/** [ovr, prime-age value in $] control points; values are log-interpolated between them. */
const VALUE_CURVE: [number, number][] = [
  [30, 5_000], [45, 25_000], [55, 60_000], [65, 500_000], [66, 600_000], [75, 2_500_000],
  [76, 3_000_000], [84, 7_500_000], [85, 8_000_000], [90, 16_000_000], [95, 28_000_000], [99, 40_000_000],
];
/** [ovr, weekly wage in $] */
const WAGE_CURVE: [number, number][] = [
  [30, 120], [45, 200], [55, 500], [65, 2_000], [66, 2_500], [75, 8_000],
  [76, 10_000], [84, 25_000], [85, 30_000], [90, 55_000], [95, 80_000], [99, 110_000],
];

function logInterp(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const t = (x - x0) / (x1 - x0);
      return y0 * Math.pow(y1 / y0, t);
    }
  }
  return pts[pts.length - 1][1];
}

export const primeValue = (ovr: number): number => logInterp(VALUE_CURVE, ovr);
export const primeWage = (ovr: number): number => logInterp(WAGE_CURVE, ovr);

/** 1.0 up to 27, then a steep fall: ~0.8 at 29, ~0.5 at 31, ~0.15 at 33. */
export function ageDepreciation(age: number): number {
  if (age <= 27) return 1;
  const a = age - 27;
  return Math.max(0.1, 1 - 0.07 * a - 0.012 * a * a);
}
