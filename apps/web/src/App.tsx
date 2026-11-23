import { twoServers } from "./examples";
import { useSimulation } from "./simulation/use-simulation";

const ms = (value: number) => `${value.toFixed(1)} ms`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function App() {
  const { metrics, playing, error, play, pause } = useSimulation(twoServers);

  return (
    <main
      style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}
    >
      <h1>System Design Interactive</h1>
      <p>
        <code>examples/two-servers.json</code>, simulated in a Web Worker in real time. Numbers cover the last
        5 seconds of simulated time.
      </p>
      <button type="button" onClick={playing ? pause : play}>
        {playing ? "Pause" : "Play"}
      </button>
      {error && <p role="alert">Simulation error: {error}</p>}
      {metrics && (
        <dl>
          <dt>Simulated time</dt>
          <dd>{metrics.timeSeconds.toFixed(1)} s</dd>
          <dt>Throughput</dt>
          <dd>{metrics.throughputPerSecond.toFixed(0)} req/s</dd>
          <dt>Error rate</dt>
          <dd>{percent(metrics.errorRate)}</dd>
          <dt>Latency p50 / p99</dt>
          <dd>{metrics.latency ? `${ms(metrics.latency.p50Ms)} / ${ms(metrics.latency.p99Ms)}` : "-"}</dd>
          {metrics.nodes
            .filter((node) => node.utilization !== undefined)
            .map((node) => (
              <div key={node.id}>
                <dt>{node.id} busy</dt>
                <dd>{percent(node.utilization ?? 0)}</dd>
              </div>
            ))}
        </dl>
      )}
    </main>
  );
}
