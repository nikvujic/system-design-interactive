import type { Micros } from "./time";

interface Entry<T> {
  time: Micros;
  /** Insertion order. Breaks ties between events scheduled for the same time. */
  seq: number;
  event: T;
}

/** True if `a` must be processed before `b`: earlier time first, then earlier insertion. */
function before<T>(a: Entry<T>, b: Entry<T>): boolean {
  return a.time < b.time || (a.time === b.time && a.seq < b.seq);
}

/**
 * The simulation's list of future events, always handing out the earliest one next.
 *
 * Implemented as a binary min-heap stored in an array: `push` and `pop` cost O(log n),
 * so the queue stays fast with hundreds of thousands of pending events. Events scheduled
 * for the same time come out in the order they were pushed, which keeps runs deterministic.
 */
export class EventQueue<T> {
  private readonly heap: Entry<T>[] = [];
  private nextSeq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(time: Micros, event: T): void {
    if (!Number.isSafeInteger(time) || time < 0) {
      throw new RangeError(`Event time must be a non-negative integer of microseconds, got ${time}`);
    }
    this.heap.push({ time, seq: this.nextSeq++, event });
    this.siftUp(this.heap.length - 1);
  }

  /** Time of the earliest event, without removing it. */
  peekTime(): Micros | undefined {
    return this.heap[0]?.time;
  }

  /** Removes and returns the earliest event, or `undefined` if the queue is empty. */
  pop(): { time: Micros; event: T } | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (first === undefined || last === undefined) {
      return undefined;
    }
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return { time: first.time, event: first.event };
  }

  // Heap layout: the children of index i are at 2i+1 and 2i+2, its parent at (i-1)/2.
  // Indices passed to the helpers below are always in range, hence the `!` assertions.

  private siftUp(index: number): void {
    const heap = this.heap;
    const entry = heap[index]!;
    let i = index;
    while (i > 0) {
      const parentIndex = (i - 1) >> 1;
      const parent = heap[parentIndex]!;
      if (!before(entry, parent)) break;
      heap[i] = parent;
      i = parentIndex;
    }
    heap[i] = entry;
  }

  private siftDown(index: number): void {
    const heap = this.heap;
    const length = heap.length;
    const entry = heap[index]!;
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= length) break;
      const right = left + 1;
      const child = right < length && before(heap[right]!, heap[left]!) ? right : left;
      if (!before(heap[child]!, entry)) break;
      heap[i] = heap[child]!;
      i = child;
    }
    heap[i] = entry;
  }
}
