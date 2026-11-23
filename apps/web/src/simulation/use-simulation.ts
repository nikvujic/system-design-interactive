import type { LiveMetrics } from "@sdi/engine";
import type { Design } from "@sdi/schema";
import { useEffect, useRef, useState } from "react";
import type { FromWorker, ToWorker } from "./protocol";

export interface SimulationState {
  metrics: LiveMetrics | undefined;
  playing: boolean;
  error: string | undefined;
  /** Counts restarts, so controls that keep their own state can reset with the run. */
  runNumber: number;
  play(): void;
  pause(): void;
  /** Starts the design again from time 0, paused, with its original traffic. */
  restart(): void;
  setSpeed(speed: number): void;
  setRequestsPerSecond(nodeId: string, requestsPerSecond: number): void;
}

/**
 * Runs `design` in a Web Worker and returns its latest metrics, which update about four times a
 * second while playing. The worker starts when the component mounts and stops when it unmounts.
 */
export function useSimulation(design: Design, seed = 1): SimulationState {
  const worker = useRef<Worker | undefined>(undefined);
  const [metrics, setMetrics] = useState<LiveMetrics>();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();
  const [runNumber, setRunNumber] = useState(0);

  useEffect(() => {
    const instance = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    instance.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      if (message.type === "metrics") {
        setMetrics(message.metrics);
        setPlaying(message.playing);
      } else {
        setError(message.message);
      }
    };
    const load: ToWorker = { type: "load", design, seed };
    instance.postMessage(load);
    worker.current = instance;
    return () => {
      instance.terminate();
      worker.current = undefined;
    };
  }, [design, seed]);

  const send = (message: ToWorker) => worker.current?.postMessage(message);
  return {
    metrics,
    playing,
    error,
    runNumber,
    play: () => send({ type: "play" }),
    pause: () => send({ type: "pause" }),
    restart: () => {
      setError(undefined);
      setRunNumber((n) => n + 1);
      send({ type: "load", design, seed });
    },
    setSpeed: (speed) => send({ type: "setSpeed", speed }),
    setRequestsPerSecond: (nodeId, requestsPerSecond) =>
      send({ type: "setRequestsPerSecond", nodeId, requestsPerSecond }),
  };
}
