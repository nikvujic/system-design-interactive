# CLAUDE.md

Guidance for AI coding agents working in this repository.

## Project

System Design Interactive is a browser app for learning system design. Users build architectures from
infrastructure components, run a traffic simulation, and see whether the design meets its latency, error-rate,
availability and cost targets.

**Status:** Phase 0, the headless engine spike ([Roadmap](docs/07-roadmap.md)). The engine core
(event loop, seeded randomness, server node, latency histograms), its validation suite, the design schema
and a command-line runner exist. There is no UI yet.

## Read first

The documents in `docs/` are the source of truth. Read the ones relevant to your task before making changes:

| Task | Read |
|---|---|
| Anything | [README](README.md), [Open design questions](docs/08-decisions-needed.md) |
| Simulation engine | [Simulation engine](docs/02-simulation-engine.md), [Component catalog](docs/03-component-catalog.md) |
| App structure, tooling | [Technical architecture](docs/04-technical-architecture.md) |
| Problems, grading, content | [Problems & grading](docs/05-problems-and-grading.md) |
| UI | [UX & visualization](docs/06-ux-and-visualization.md) |
| Scope and sequencing | [Roadmap](docs/07-roadmap.md) |

If an implementation needs to diverge from a document, update the document in the same change. Record
significant technical decisions as ADRs in `docs/adr/` (context, decision, consequences).

## Current scope

- Work follows the roadmap phases in order. Do not start work from a later phase, or add components beyond
  the current wave ([Component catalog §3.10](docs/03-component-catalog.md)), unless explicitly asked.
- The initial build is client-only: the simulation runs in the browser and designs are stored locally with
  JSON export/import. There are no accounts and no backend. Backend sections in the architecture document
  describe a possible later phase.

## Architecture rules

- **Monorepo:** pnpm workspaces + Turborepo. Internal packages use the `@sdi/` scope.
- **The engine (`@sdi/engine`) is pure TypeScript** with no DOM or Node.js runtime dependencies. It depends
  only on `@sdi/schema`.
- **Determinism:** the same design, scenario and seed must produce identical results.
  - Simulated time is integer microseconds. No floating-point time.
  - No `Date.now()`, `Math.random()` or other ambient nondeterminism inside the engine.
  - Seeded PRNG with a separate stream per node. Event ties are broken by a monotonic sequence number.
- **The engine knows nothing about rendering.** It emits metrics, sampled particles and traces. The UI
  decides what to draw.
- **Data-driven catalog:** a component is defined by its config schema, engine behavior and UI metadata.
  Adding a component should not require editor changes.
- **Shared schemas:** zod schemas in `@sdi/schema` are the single contract for designs, component configs,
  scenarios and results. Saved designs carry a `schemaVersion` with migrations.
- **Guidance content is data,** separate from UI components, and rendered according to a guidance level.
- **UI performance:** the engine runs in a Web Worker. React does not re-render per animation frame;
  particles are drawn on a single canvas overlay.

## Code standards

- TypeScript strict mode. No `any` in `engine` or `schema`.
- Tests with Vitest. Engine changes need tests; behavior changes to the simulation need validation-suite or
  golden-scenario coverage ([Simulation engine §2.10](docs/02-simulation-engine.md)).
- Watch engine performance. Benchmarks run in CI once they exist.
- Conventional commits.

## Commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies for all packages |
| `pnpm typecheck` | Type-check every package (Turborepo, cached) |
| `pnpm test` | Run all tests, including the engine validation suite (Turborepo, cached) |
| `pnpm bench` | Run the engine benchmark (not cached, so it always measures) |
| `pnpm sim run <design.json>` | Validate and simulate a design file, e.g. `examples/two-servers.json` (`--help` for options) |
| `pnpm --filter @sdi/engine <script>` | Run a script in one package |

## Documentation standards

This is a public repository. Everything committed must read as professional project documentation.

- Docs describe the project: scope, design, decisions and their technical rationale. They do not describe
  the conversations or working sessions that produced them.
- No personal information, private notes, or individual preferences presented as project requirements.
- Write decisions as project direction ("The initial build does not require accounts"), not as
  recommendations from one person to another.
- Be precise about certainty. Label unsourced numbers as initial estimates. Validation tests check specific
  cases; do not claim they prove the simulator correct.
- Content (problems, explanations, solutions) must be original. Research can inform topics; do not copy
  text, diagrams or solutions from other sources.
- Use plain language and define terms, or link to the [Glossary](docs/09-glossary.md).
