/** Small, fast, serialisable PRNG (mulberry32). Pure TS — no React. */
export interface Rng {
  state: number;
  next(): number;
  int(min: number, max: number): number;
  range(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  normal(mean: number, sd: number): number;
  shuffle<T>(arr: T[]): T[];
}

export function createRng(seed: number): Rng {
  const rng: Rng = {
    state: seed >>> 0,
    next() {
      let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    range(min, max) {
      return min + rng.next() * (max - min);
    },
    chance(p) {
      return rng.next() < p;
    },
    pick(arr) {
      return arr[Math.floor(rng.next() * arr.length)];
    },
    weighted(items, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = rng.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    normal(mean, sd) {
      const u = 1 - rng.next();
      const v = rng.next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
  return rng;
}

/** Deterministic hash → [0,1) for stable per-(player, staff) biases. */
export function hash01(a: number, b: string): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < b.length; i++) {
    h = Math.imul(h ^ b.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
