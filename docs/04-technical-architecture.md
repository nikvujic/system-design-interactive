# 4. Technical Architecture

The proposed client uses React. The simulation engine and shared design and problem schemas use strict
TypeScript. If server-side grading is introduced, Node.js can run the same engine package.

The initial prototype runs simulations in the browser and stores designs locally. The backend architecture
below describes a possible later phase if server-side grading or account-backed features are introduced.

---

## 4.1 High-level architecture

```
┌──────────────────────────── Browser ─────────────────────────────┐
│                                                                  │
│  React App (Vite)                                                │
│   ├── Editor canvas (React Flow)  ◄── design state (Zustand)     │
│   ├── Particle overlay (Canvas2D / PixiJS)                       │
│   ├── Inspector panels, config forms (zod-driven)                │
│   └── Metrics dashboards (uPlot)                                 │
│            ▲  frames (typed arrays, ~30Hz)    │ commands          │
│            │                                  ▼                  │
│  Web Worker: @sdi/engine  (same package the server uses)         │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS (REST / tRPC)
┌──────────────────────────────▼───────────────────────────────────┐
│  API (Node, Fastify)                                             │
│   ├── Auth, users, progress                                      │
│   ├── Problems & content (read-mostly)                           │
│   ├── Designs (save/load/share)                                  │
│   └── Submissions ──► Job queue (BullMQ on Redis)                │
│                              │                                   │
│  Grader workers (Node worker_threads) ── @sdi/engine (headless)  │
│                              │                                   │
│  PostgreSQL ◄────────────────┘          Object storage (replays) │
└──────────────────────────────────────────────────────────────────┘
```

Key idea: **the engine is an isomorphic library.** The browser runs it for instant feedback; the server
runs the exact same version for authoritative grading. The client is never trusted for a score.

---

## 4.2 Monorepo layout

**pnpm workspaces + Turborepo.**

```
system-design-interactive/
├── apps/
│   ├── web/                 # React app (Vite)
│   └── api/                 # Node API + grader worker entrypoints
├── packages/
│   ├── engine/              # Simulation engine: pure TS, zero deps on DOM/Node
│   ├── schema/              # zod schemas: Design, Component configs, Problem, Scenario, Results
│   ├── catalog/             # Component definitions: config schema, defaults, tiers, pricing, icons metadata
│   ├── content/             # Problems (YAML/MDX) + learn cards, validated at build time
│   ├── ui/                  # Shared UI primitives (design system)
│   └── tsconfig/ eslint-config/   # shared tooling config
├── docs/                    # These planning docs, then ADRs
└── turbo.json
```

Why this split:
- `engine` depends only on `schema`. It can be tested, benchmarked and versioned independently.
- `catalog` is **data-driven**: adding a new component = adding a definition (config schema + engine behavior
  + UI metadata), not touching editor code. The inspector forms are generated from the zod schemas.
- `content` lives in git: problems are code-reviewed, versioned and validated in CI (every problem's
  reference solution must pass, and its starting design must fail. See doc 05).

---

## 4.3 Frontend

| Concern | Choice | Reasoning |
|---|---|---|
| Build | **Vite** | Fast, first-class worker support |
| Routing | **TanStack Router** (or React Router v7) | Type-safe routes |
| Graph editor | **React Flow (@xyflow/react)** | Industry standard for node editors; custom nodes are plain React components; handles pan/zoom/selection/minimap |
| Particles ("dots") | **Single Canvas overlay** (Canvas2D first, PixiJS/WebGL if needed) | Animating thousands of SVG elements inside React Flow edges would drop frames. One canvas, synced to the React Flow viewport transform, draws all particles in one pass. |
| App state | **Zustand** (+ Immer) | Simple, fast, works with React Flow's own store patterns |
| Undo/redo | Command pattern on the design store (or `zundo`) | Expected in any professional editor |
| Server state | **TanStack Query** | Caching, retries |
| Forms | **React Hook Form + zod** (schemas from `@sdi/schema`) | One schema validates on client, server and engine |
| Charts | **uPlot** | Built for high-frequency streaming time series and tiny. Recharts struggles with live data. |
| Styling | **Tailwind CSS + Radix UI primitives** (shadcn/ui) | Accessible, professional look, fast to build |
| Worker comms | **Comlink** for commands; raw `postMessage` with transferable `ArrayBuffer`s for frames | Zero-copy for the hot path |
| Testing | **Vitest** + Testing Library; **Playwright** for E2E | |

### Render loop (important for smoothness)

- The engine worker runs sim time ahead in chunks and posts a **frame** at ~30 Hz.
- The main thread uses `requestAnimationFrame` and **interpolates** particle positions between frames,
  so animation is 60 fps even though data arrives at 30 Hz.
- React does **not** re-render per frame. Node metric badges subscribe to a store slice that updates at ~4 Hz.
  Only the canvas redraws every frame. Re-rendering the React tree at 60 Hz is a common performance
  mistake in this kind of app.

---

## 4.4 Backend

| Concern | Choice | Reasoning |
|---|---|---|
| Framework | **Fastify** | Fast, schema-first, good TS support. (NestJS is an alternative with more built-in structure, at the cost of more weight.) |
| API style | **tRPC** or REST + OpenAPI generated from zod | tRPC gives end-to-end types for free in a TS monorepo. REST if a public API is planned. |
| DB | **PostgreSQL** | Relational data (users, problems, submissions), JSONB for designs |
| ORM / query | **Drizzle** | Type-safe, SQL-like, light. (Prisma is an acceptable alternative.) |
| Jobs | **BullMQ + Redis** | Grading is CPU-heavy, so it runs off the request path with retries and concurrency control |
| Grader isolation | `worker_threads` with time + event budget | A malicious or huge design can't hang the server |
| Auth | **Better Auth** or a managed provider (Clerk) | Email + GitHub/Google OAuth. Don't hand-roll auth. |
| Storage | S3-compatible (R2/S3) | Replay files, design thumbnails |
| Observability | OpenTelemetry + Sentry | Trace and monitor API and grading workloads |

### Core data model (first cut)

```
users(id, email, name, created_at, ...)
problems(id, slug, version, track_id, difficulty, content_ref, engine_version)
designs(id, user_id, problem_id?, name, graph JSONB, schema_version, updated_at, is_public, share_slug)
submissions(id, user_id, problem_id, problem_version, design_snapshot JSONB,
            engine_version, status, score JSONB, cost, created_at)
progress(user_id, problem_id, best_submission_id, solved_at)
```

- Designs are stored as a **versioned JSON document** (`schema_version`) with migration functions in
  `@sdi/schema`. The editor format *will* change, and old designs must keep loading.
- Submissions store a **snapshot** of the design (not a reference), so later edits don't rewrite history.

---

## 4.5 The Design document (shared contract)

```ts
interface Design {
  schemaVersion: 1;
  nodes: Array<{
    id: string;
    type: ComponentType;           // "server" | "load_balancer" | ...
    position: { x: number; y: number };
    placement?: { region: string; az?: string };
    config: ComponentConfig;       // discriminated union validated by zod per type
  }>;
  edges: Array<{ id: string; source: string; target: string; config?: LinkConfig }>;
  workload: Workload;
  groups?: Array<{ id: string; kind: "region" | "az"; ... }>;
}
```

The engine compiles a `Design` into an internal runtime topology (`compile(design) → SimModel`) with
validation errors surfaced in the editor ("Server has no handler for op `read_feed`").

---

## 4.6 Security & abuse

- Grading runs only server-side on server-held hidden scenarios. Scenarios are never sent to the client.
- Submission rate limits per user (grading is the expensive endpoint).
- Event budget + wall-clock timeout per grading job.
- Validate every design against zod schemas plus sanity limits (max nodes, max replicas) before it reaches the engine.

---

## 4.7 Infrastructure & deployment (keep it boring)

- **Early stage:** web on Vercel/Netlify/Cloudflare Pages (static SPA); API + workers on Fly.io/Render/Railway; managed Postgres (Neon/Supabase) and managed Redis (Upstash).
- Everything containerized (Docker) from day 1, so moving to AWS/GCP later is mechanical.
- **CI:** GitHub Actions: typecheck, lint, unit tests, engine validation suite, content validation, E2E smoke, engine benchmark.
- Environments: `preview` per PR (web), `staging`, `prod`.

---

## 4.8 Engineering practices

- **ADRs** (Architecture Decision Records) in `docs/adr/` for each significant choice. Short: context, decision, consequences.
- Conventional commits + changesets for package versioning (the engine version matters for grading).
- Strict TS, no `any` in `engine` and `schema`.
- Engine coverage target high (>90%); UI coverage targeted at logic, not snapshots.
- Feature flags for unfinished components.

---

## 4.9 Things deliberately NOT chosen

| Option | Why not (for now) |
|---|---|
| Next.js | The core app is a heavy client-side editor; SSR adds complexity with little benefit. A separate marketing site can use Next/Astro later for SEO. |
| Rust/WASM engine | Premature. Port the hot core later if profiling demands it; the package boundary makes that possible. |
| Microservices | A modular monolith keeps the initial API and grading workers deployable with less operational overhead. |
| GraphQL | No need for it. tRPC/REST covers the access patterns. |
| D3 for the editor | React Flow handles editor interactions much better; D3 is fine for custom charts if ever needed. |
