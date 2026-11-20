# 7. Roadmap

Each phase has an **exit criterion**. Later phases depend on the preceding phase meeting its exit criteria.
Timeline ranges are estimates, not commitments.

---

## Phase 0: Foundations & engine spike (2-4 weeks)

**Goal:** validate the feasibility and performance of the simulation engine before building the UI.

- Monorepo skeleton (pnpm, Turborepo, TS strict, Vitest, ESLint/Prettier, CI).
- `@sdi/engine` headless: clock, event queue, seeded RNG, Clients → Server → (LB) topology.
- Lognormal/exponential service times, bounded queue, rejections.
- Metrics with HDR histograms.
- **Validation suite:** M/M/1, M/M/c, Little's Law within tolerance.
- CLI runner: `pnpm sim run design.json scenario.yaml` → prints metrics table.
- Benchmark: events/sec on a reference topology.

**Exit criterion:** the M/M/c validation passes, and a 3-node topology at 5k RPS simulates 60 s of sim
time in < 2 s wall time.

---

## Phase 1: Sandbox MVP (4-8 weeks)

**Goal:** a free-form editor where you can build, run and *see* a simulation.

- React app, React Flow canvas, palette, inspector forms generated from zod schemas.
- Components: Clients, Load Balancer, Server, Database, Cache (wave 1).
- Handler presets (direct call, cache-aside, read-replica routing).
- Engine in a Web Worker; play/pause/speed controls.
- Particle canvas overlay with interpolation.
- Node heat and live badges; metrics bar; latency/throughput/utilization charts.
- Save/load designs to local storage; export/import JSON.
- Undo/redo.

**Exit criterion:** problem-1 behavior works end-to-end in Sandbox, and a first-time user can understand
what is happening without additional explanation.

---

## Phase 2: Problem mode, local (3-5 weeks)

- Problem format + content package + CI content validation.
- Problem view: story, locked nodes, SLO tiles, hints.
- Local "check" against the visible scenario.
- Bottleneck detector v1 + failure explanation report.
- First 5 Foundations problems.
- Learn cards for those concepts.

**Exit criterion:** 5 people outside the project complete problems 1-5. Collect feedback on realism and clarity.

---

## Phase 3: Backend & real platform (4-6 weeks)

- Fastify API, Postgres, Drizzle, auth.
- Save designs to account, progress tracking.
- Submission pipeline: BullMQ + grader workers, hidden scenarios, multi-seed.
- Results history, cost percentile ranking.
- Shareable read-only design links.
- Deploy: staging + prod, monitoring, error tracking.

**Exit criterion:** public beta with 15 Foundations problems.

---

## Phase 4: Depth (ongoing)

- Wave 2-3 components: Queue, Worker, CDN, Object storage, API Gateway, Regions/AZs, Autoscaling.
- Chaos events and failure scenarios.
- Reliability mechanics: retries, circuit breakers, health checks.
- Traces + waterfall view.
- First case-study tracks (URL shortener, Rate limiter).
- Live editing during runs.

## Phase 5: Scale & community (later)

- Wave 4-5 components (sharding, streams, serverless, multi-region data).
- Hybrid fluid engine for very high RPS, if profiling demands it.
- Problem authoring UI, community problems with moderation.
- Monetization, if the project moves toward productization.
- Replays, embeds (great for blogs: "here's a live simulation of a retry storm").

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Simulation feels unrealistic to experienced engineers | Medium | **Critical** | Validation suite, sourced calibration, early review by experienced engineers and SREs |
| Handler/behavior config too complex for beginners | High | High | Presets first, advanced editor hidden; test with real users in Phase 2 |
| Performance: animation jank or slow sim | Medium | High | Canvas overlay, worker, benchmarks in CI from Phase 0 |
| Scope creep (too many components before the core is good) | **High** | High | Strict waves; exit criteria per phase |
| Content creation is slower than code | High | Medium | Authoring in-app, CI validation, templates |
| Legal: copying existing question banks/solutions | Low (if careful) | High | Original content only; crawl for topics, never text |
