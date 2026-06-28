/** Deterministic, dependency-free PRNG utilities for the mock provider. */

/** FNV-1a string hash → uint32. */
export function hashString(input: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed a PRNG from any combination of string/number parts. */
export function seededRng(...parts: Array<string | number>): () => number {
  return mulberry32(hashString(parts.join(':')));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]!;
}

export function rangeValue(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function intInRange(rng: () => number, min: number, max: number): number {
  return Math.floor(rangeValue(rng, min, max + 1));
}

/** Standard-normal sample via Box–Muller. */
export function gaussian(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
