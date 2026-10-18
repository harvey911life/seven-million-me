// 隨機數：mulberry32 + MurmurHash3 風格 hash32（GDD 2.7.1）
export type RNG = {
  (): number; // [0, 1)
  int(a: number, b: number): number; // 包含兩端
  uni(a: number, b: number): number;
  normal(mu?: number, sd?: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<K extends string>(w: Partial<Record<K, number>>): K;
};

function murmurMix(h: number, k: number): number {
  k = Math.imul(k, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

export function hash32(seed: number, ...parts: (string | number)[]): number {
  let h = seed | 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) h = murmurMix(h, s.charCodeAt(i));
    h = murmurMix(h, 0x2f);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = next as RNG;
  r.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  r.uni = (lo, hi) => lo + next() * (hi - lo);
  r.normal = (mu = 0, sd = 1) => {
    const u = Math.max(next(), 1e-12);
    const v = next();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  r.chance = (p) => next() < p;
  r.pick = (arr) => arr[Math.floor(next() * arr.length)];
  r.weighted = (w) => {
    const entries = Object.entries(w) as [string, number][];
    let total = 0;
    for (const [, v] of entries) total += Math.max(0, v || 0);
    let x = next() * total;
    for (const [k, v] of entries) {
      x -= Math.max(0, v || 0);
      if (x < 0) return k as never;
    }
    return entries[entries.length - 1][0] as never;
  };
  return r;
}

export const streamRng = (seed: number, ...parts: (string | number)[]) => makeRng(hash32(seed, ...parts));
