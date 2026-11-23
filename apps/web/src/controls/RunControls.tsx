import type { ClientsNode, Design } from "@sdi/schema";
import { useState } from "react";
import type { SimulationState } from "../simulation/use-simulation";

/** Simulated seconds per wall-clock second. */
export const SPEEDS = [0.5, 1, 2, 5, 10, 20] as const;

/** The traffic slider goes up to at least this many requests per second. */
const MIN_SLIDER_MAX = 10_000;

/** The slider's upper end: room for several times the design's own traffic. */
export function sliderMax(requestsPerSecond: number): number {
  return Math.max(MIN_SLIDER_MAX, Math.ceil((requestsPerSecond * 5) / 1000) * 1000);
}

/**
 * Play, pause, restart and speed for the run, and a traffic slider for each clients node.
 * The slider keeps its own value while dragging, so it follows the pointer without waiting for
 * the worker; the worker applies each change from the simulated time it arrives.
 */
export function RunControls({ design, simulation }: { design: Design; simulation: SimulationState }) {
  const [speed, setSpeed] = useState(1);
  const clients = design.nodes.filter((node): node is ClientsNode => node.type === "clients");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <button type="button" onClick={simulation.playing ? simulation.pause : simulation.play}>
        {simulation.playing ? "Pause" : "Play"}
      </button>
      <button type="button" onClick={simulation.restart}>
        Restart
      </button>
      <label>
        Speed{" "}
        <select
          value={speed}
          onChange={(event) => {
            const value = Number(event.target.value);
            setSpeed(value);
            simulation.setSpeed(value);
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      {clients.map((node) => (
        <TrafficSlider
          key={`${node.id}-${simulation.runNumber}`}
          node={node}
          onChange={(rate) => simulation.setRequestsPerSecond(node.id, rate)}
        />
      ))}
    </div>
  );
}

function TrafficSlider({ node, onChange }: { node: ClientsNode; onChange: (rate: number) => void }) {
  const [rate, setRate] = useState(node.requestsPerSecond);
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {node.id} traffic
      <input
        type="range"
        min={0}
        max={sliderMax(node.requestsPerSecond)}
        step={100}
        value={rate}
        onChange={(event) => {
          const value = Number(event.target.value);
          setRate(value);
          onChange(value);
        }}
      />
      <output style={{ minWidth: 72, fontVariantNumeric: "tabular-nums" }}>
        {rate.toLocaleString("en-US")}/s
      </output>
    </label>
  );
}
