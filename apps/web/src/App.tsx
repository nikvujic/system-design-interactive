import { DesignCanvas } from "./canvas/DesignCanvas";
import { RunControls } from "./controls/RunControls";
import { twoServers } from "./examples";
import { useSimulation } from "./simulation/use-simulation";

const ms = (value: number) => `${value.toFixed(1)} ms`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function App() {
  const simulation = useSimulation(twoServers);
  const { metrics, error } = simulation;

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 24,
          padding: "8px 16px",
          borderBottom: "1px solid #e5e7eb",
          fontSize: 14,
        }}
      >
        <strong>System Design Interactive</strong>
        <RunControls design={twoServers} simulation={simulation} />
        {metrics && (
          <>
            <span>t = {metrics.timeSeconds.toFixed(1)} s</span>
            <span>{metrics.throughputPerSecond.toFixed(0)} req/s</span>
            <span>errors {percent(metrics.errorRate)}</span>
            <span>
              p50 / p99{" "}
              {metrics.latency ? `${ms(metrics.latency.p50Ms)} / ${ms(metrics.latency.p99Ms)}` : "-"}
            </span>
            <span style={{ color: "#6b7280" }}>last {metrics.windowSeconds.toFixed(0)} s</span>
          </>
        )}
        {error && <span role="alert">Simulation error: {error}</span>}
      </header>
      <div style={{ flex: 1 }}>
        <DesignCanvas design={twoServers} metrics={metrics?.nodes} />
      </div>
    </main>
  );
}
