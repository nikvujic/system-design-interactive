import { LiveRun } from "@sdi/engine";
import type { FromWorker, ToWorker } from "./protocol";

/**
 * How often the page receives metrics while playing, in wall-clock milliseconds. Once a second
 * keeps numbers readable, and each update changes text on the canvas, which makes the browser
 * repaint the animated connections; updating more often made their animation visibly stutter.
 */
export const METRICS_INTERVAL_MS = 1000;
/**
 * After the user changes something while playing (play, speed, traffic), the next update comes this
 * soon instead, so the change shows quickly. Regular updates then resume at `METRICS_INTERVAL_MS`.
 */
export const QUICK_UPDATE_MS = 250;
/**
 * The longest wall-clock gap one tick catches up on. Browsers slow down timers in background tabs;
 * without a cap, returning to the tab would jump the simulation far ahead in one step.
 */
export const MAX_TICK_GAP_MS = 100;

/**
 * Runs a LiveRun in step with the wall clock. The worker calls `handle` for every message and
 * `tick` on a timer; everything else, including the clock, is passed in so tests can drive it.
 */
export class SimController {
  private run: LiveRun | undefined;
  private playing = false;
  private speed = 1;
  private lastTick = 0;
  /** Wall-clock time the next metrics update is due while playing. */
  private nextPost = 0;

  constructor(
    private readonly now: () => number,
    private readonly post: (message: FromWorker) => void,
  ) {}

  handle(message: ToWorker): void {
    try {
      switch (message.type) {
        case "load":
          this.run = new LiveRun(message.design, { seed: message.seed });
          this.playing = false;
          break;
        case "play":
          this.requireRun();
          this.playing = true;
          this.lastTick = this.now();
          break;
        case "pause":
          this.playing = false;
          break;
        case "setSpeed":
          if (!(message.speed > 0 && Number.isFinite(message.speed))) {
            throw new RangeError(`Speed must be a positive number, got ${message.speed}`);
          }
          this.speed = message.speed;
          break;
        case "setRequestsPerSecond":
          this.requireRun().setRequestsPerSecond(message.nodeId, message.requestsPerSecond);
          break;
      }
      if (message.type === "load" || message.type === "pause" || !this.playing) {
        // Confirm at once: the page shows the play state from these, and nothing is animating.
        this.postMetrics();
      } else if (message.type === "play") {
        // Confirm at once for the play button, then again soon: no simulated time has passed yet,
        // so the first numbers show no traffic.
        this.postMetrics();
        this.nextPost = this.now() + QUICK_UPDATE_MS;
      } else {
        // Speed or traffic changed while playing: show its effect soon, without posting on every
        // slider movement.
        this.nextPost = Math.min(this.nextPost, this.now() + QUICK_UPDATE_MS);
      }
    } catch (error) {
      this.post({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Advances simulated time by the wall-clock time since the last tick, scaled by the speed. */
  tick(): void {
    if (!this.playing || !this.run) return;
    const wall = this.now();
    const gapMs = Math.min(wall - this.lastTick, MAX_TICK_GAP_MS);
    this.lastTick = wall;
    // Simulated time is integer microseconds.
    const step = Math.round(gapMs * 1000 * this.speed);
    if (step > 0) this.run.advance(step);
    if (wall >= this.nextPost) this.postMetrics();
  }

  private requireRun(): LiveRun {
    if (!this.run) throw new Error("No design is loaded");
    return this.run;
  }

  private postMetrics(): void {
    if (!this.run) return;
    this.nextPost = this.now() + METRICS_INTERVAL_MS;
    this.post({ type: "metrics", playing: this.playing, metrics: this.run.metrics() });
  }
}
