/**
 * A latency histogram with bounded relative error (the idea behind HDR Histogram).
 *
 * Values are whole microseconds. Values below 128 are stored exactly; larger values fall into
 * buckets whose width is 1/64 of their magnitude, so any reported percentile is within about
 * 1% of the true value. Memory is fixed (1,728 counters) no matter how many values are recorded,
 * and histograms can be merged, so per-window or per-node histograms can be combined exactly.
 */

const SUB_BUCKET_BITS = 7;
const SUB_BUCKET_COUNT = 1 << SUB_BUCKET_BITS; // 128
const HALF_SUB_BUCKET_COUNT = SUB_BUCKET_COUNT / 2; // 64
const MAX_VALUE = 2 ** 32 - 1; // about 71 minutes of simulated time
const BUCKET_COUNT = HALF_SUB_BUCKET_COUNT * (32 - SUB_BUCKET_BITS + 1) + HALF_SUB_BUCKET_COUNT;

function bucketIndex(value: number): number {
  if (value < SUB_BUCKET_COUNT) return value;
  const topBit = 31 - Math.clz32(value);
  const shift = topBit - (SUB_BUCKET_BITS - 1);
  return shift * HALF_SUB_BUCKET_COUNT + (value >>> shift);
}

/** The midpoint of the values that land in bucket `index`. */
function bucketMidpoint(index: number): number {
  if (index < SUB_BUCKET_COUNT) return index;
  const shift = Math.floor(index / HALF_SUB_BUCKET_COUNT) - 1;
  const subBucket = index - shift * HALF_SUB_BUCKET_COUNT;
  const lower = subBucket * 2 ** shift;
  const width = 2 ** shift;
  return lower + (width - 1) / 2;
}

export class Histogram {
  private readonly counts = new Float64Array(BUCKET_COUNT);
  private total = 0;
  private sum = 0;
  private minValue = Number.POSITIVE_INFINITY;
  private maxValue = Number.NEGATIVE_INFINITY;

  /** Records one value (whole microseconds, 0 to about 71 minutes). */
  record(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > MAX_VALUE) {
      throw new RangeError(`Histogram values must be integers from 0 to ${MAX_VALUE}, got ${value}`);
    }
    this.counts[bucketIndex(value)]! += 1;
    this.total++;
    this.sum += value;
    if (value < this.minValue) this.minValue = value;
    if (value > this.maxValue) this.maxValue = value;
  }

  get count(): number {
    return this.total;
  }

  /** Exact mean, or `undefined` if nothing was recorded. */
  get mean(): number | undefined {
    return this.total === 0 ? undefined : this.sum / this.total;
  }

  get min(): number | undefined {
    return this.total === 0 ? undefined : this.minValue;
  }

  get max(): number | undefined {
    return this.total === 0 ? undefined : this.maxValue;
  }

  /**
   * The value below which `percent`% of recorded values fall (e.g. 99 for p99), within about 1%.
   * Returns `undefined` if nothing was recorded.
   */
  percentile(percent: number): number | undefined {
    if (!(percent >= 0 && percent <= 100)) {
      throw new RangeError(`percent must be between 0 and 100, got ${percent}`);
    }
    if (this.total === 0) return undefined;
    const rank = Math.max(1, Math.ceil((percent / 100) * this.total));
    let seen = 0;
    for (let i = 0; i < BUCKET_COUNT; i++) {
      seen += this.counts[i]!;
      if (seen >= rank) {
        return Math.min(this.maxValue, Math.max(this.minValue, bucketMidpoint(i)));
      }
    }
    return this.maxValue;
  }

  /** Adds all values recorded in `other` to this histogram. */
  merge(other: Histogram): void {
    if (other.total === 0) return;
    for (let i = 0; i < BUCKET_COUNT; i++) this.counts[i]! += other.counts[i]!;
    this.total += other.total;
    this.sum += other.sum;
    this.minValue = Math.min(this.minValue, other.minValue);
    this.maxValue = Math.max(this.maxValue, other.maxValue);
  }
}
