/**
 * Deterministic random numbers.
 *
 * The engine never uses `Math.random()`. Every source of randomness is a `RandomStream`
 * derived from the run's seed and a stable name (usually a node id), so:
 * - the same seed always produces the same run, and
 * - adding a node creates a new stream without changing the numbers other nodes draw.
 */

const TWO_POW_32 = 2 ** 32;

/** FNV-1a: a small, stable 32-bit hash used to turn a stream name into a number. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** SplitMix32: spreads one 32-bit seed into well-mixed state words. */
function splitMix32(state: { value: number }): number {
  state.value = (state.value + 0x9e3779b9) | 0;
  let z = state.value;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * One independent sequence of pseudo-random numbers (xoshiro128**: fast, small state,
 * good statistical quality; not suitable for cryptography, which the engine doesn't need).
 */
export class RandomStream {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    const mixer = { value: seed | 0 };
    this.s0 = splitMix32(mixer);
    this.s1 = splitMix32(mixer);
    this.s2 = splitMix32(mixer);
    this.s3 = splitMix32(mixer);
  }

  /** Next integer in [0, 2^32). */
  nextUint32(): number {
    const result = Math.imul(rotateLeft(Math.imul(this.s1, 5), 7), 9);
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotateLeft(this.s3, 11);
    return result >>> 0;
  }

  /** Next number in [0, 1). */
  next(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /**
   * A sample from an exponential distribution with the given mean: mostly small values,
   * occasionally large ones. The gaps between Poisson (independent, random) arrivals follow it.
   */
  exponential(mean: number): number {
    // 1 - next() is in (0, 1], so the logarithm is always finite.
    return -mean * Math.log(1 - this.next());
  }
}

function rotateLeft(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

/** Creates the stream named `name` for a run with the given seed. */
export function createStream(seed: number, name: string): RandomStream {
  return new RandomStream(Math.imul(seed | 0, 0x9e3779b1) ^ hashString(name));
}
