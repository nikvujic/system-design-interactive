import { useState } from "react";
import { type ExampleRun, runTwoServersExample } from "./example-run";

const ms = (value: number) => `${value.toFixed(1)} ms`;

export function App() {
  const [result, setResult] = useState<ExampleRun>();

  return (
    <main
      style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}
    >
      <h1>System Design Interactive</h1>
      <p>
        Engine check: simulate <code>examples/two-servers.json</code> for 60 seconds of simulated time, in the
        browser.
      </p>
      <button type="button" onClick={() => setResult(runTwoServersExample(() => performance.now()))}>
        Run simulation
      </button>
      {result && (
        <dl>
          <dt>Requests completed</dt>
          <dd>{result.run.requests.completed.toLocaleString("en-US")}</dd>
          <dt>Error rate</dt>
          <dd>{(result.run.errorRate * 100).toFixed(2)}%</dd>
          <dt>Latency p50 / p99</dt>
          <dd>
            {result.run.latency ? `${ms(result.run.latency.p50Ms)} / ${ms(result.run.latency.p99Ms)}` : "-"}
          </dd>
          <dt>Wall time</dt>
          <dd>{ms(result.wallMs)}</dd>
        </dl>
      )}
    </main>
  );
}
