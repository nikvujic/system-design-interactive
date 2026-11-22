import { describe, expect, it } from "vitest";
import { type EventHandler, Simulation } from "./simulation";
import { ms, seconds } from "./time";

/** A traffic source that sends one request every `interval`, starting at time 0. */
function constantSource(interval: number, onArrival: (time: number) => void): EventHandler {
  const arrive: EventHandler = (sim) => {
    onArrival(sim.now);
    sim.schedule(interval, arrive);
  };
  return arrive;
}

describe("Simulation", () => {
  it("jumps the clock straight to each event's time", () => {
    const sim = new Simulation();
    const seen: number[] = [];
    sim.scheduleAt(ms(250), (s) => seen.push(s.now));
    sim.scheduleAt(ms(10), (s) => seen.push(s.now));

    sim.run(seconds(1));

    expect(seen).toEqual([ms(10), ms(250)]);
    expect(sim.now).toBe(seconds(1));
    expect(sim.eventsProcessed).toBe(2);
  });

  it("lets events schedule further events (a constant-rate traffic source)", () => {
    const sim = new Simulation();
    const arrivals: number[] = [];
    sim.scheduleAt(
      0,
      constantSource(ms(100), (t) => arrivals.push(t)),
    );

    sim.run(seconds(1));

    expect(arrivals).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(ms));
    // The arrival at exactly 1 s is scheduled but not yet run.
    expect(sim.pendingEvents).toBe(1);
  });

  it("gives the same result whether run in one go or in steps", () => {
    const runInOneGo: number[] = [];
    const one = new Simulation();
    one.scheduleAt(
      0,
      constantSource(ms(70), (t) => runInOneGo.push(t)),
    );
    one.run(seconds(2));

    const runInSteps: number[] = [];
    const steps = new Simulation();
    steps.scheduleAt(
      0,
      constantSource(ms(70), (t) => runInSteps.push(t)),
    );
    for (let t = ms(100); t <= seconds(2); t += ms(100)) {
      steps.run(t);
    }

    expect(runInSteps).toEqual(runInOneGo);
  });

  it("refuses to move backwards in time", () => {
    const sim = new Simulation();
    sim.run(seconds(1));
    expect(() => sim.scheduleAt(ms(500), () => {})).toThrow(RangeError);
    expect(() => sim.schedule(-1, () => {})).toThrow(RangeError);
    expect(() => sim.run(ms(500))).toThrow(RangeError);
  });
});
