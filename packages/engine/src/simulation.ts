import { EventQueue } from "./event-queue";
import type { Micros } from "./time";

/** Something that happens at a point in simulated time. It may schedule further events. */
export type EventHandler = (sim: Simulation) => void;

/**
 * The discrete-event loop: repeatedly takes the earliest pending event, moves the clock to its
 * time and runs it. Simulated time only advances here, jumping from one event to the next.
 */
export class Simulation {
  private readonly queue = new EventQueue<EventHandler>();
  private currentTime: Micros = 0;
  private processed = 0;

  /** Current simulated time. */
  get now(): Micros {
    return this.currentTime;
  }

  /** Number of events run so far. The main measure of how much work a simulation did. */
  get eventsProcessed(): number {
    return this.processed;
  }

  /** Number of events scheduled but not yet run. */
  get pendingEvents(): number {
    return this.queue.size;
  }

  /** Schedules `handler` to run `delay` microseconds from now. */
  schedule(delay: Micros, handler: EventHandler): void {
    if (!Number.isSafeInteger(delay) || delay < 0) {
      throw new RangeError(`Delay must be a non-negative integer of microseconds, got ${delay}`);
    }
    this.queue.push(this.currentTime + delay, handler);
  }

  /** Schedules `handler` at an absolute time, which must not be in the past. */
  scheduleAt(time: Micros, handler: EventHandler): void {
    if (time < this.currentTime) {
      throw new RangeError(`Cannot schedule at ${time}: the clock is already at ${this.currentTime}`);
    }
    this.queue.push(time, handler);
  }

  /**
   * Runs every event scheduled before `until`, then sets the clock to `until`.
   * Events at exactly `until` stay queued, so `run(a)` followed by `run(b)` behaves the same
   * as a single `run(b)`.
   */
  run(until: Micros): void {
    if (until < this.currentTime) {
      throw new RangeError(`Cannot run until ${until}: the clock is already at ${this.currentTime}`);
    }
    for (;;) {
      const nextTime = this.queue.peekTime();
      if (nextTime === undefined || nextTime >= until) break;
      const next = this.queue.pop()!;
      this.currentTime = next.time;
      this.processed++;
      next.event(this);
    }
    this.currentTime = until;
  }
}
