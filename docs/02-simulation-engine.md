# 2. Simulation Engine

The editor, problem content, and grading depend on the simulation engine. Its models and assumptions must
be validated so the product does not teach misleading conclusions.

---

## 2.1 Choosing a simulation approach

There are three standard ways to simulate a system like this:

| Approach | How it works | Strengths | Weaknesses |
|---|---|---|---|
| **A. Analytical (queueing formulas)** | Compute steady-state results with formulas (M/M/1, M/M/c, Little's Law) | Instant, exact for idealized cases | No time dimension, no failures, no retries, no animation. Breaks down for complex topologies. |
| **B. Fluid / time-stepped** | Every tick (e.g. 10 ms), compute *flow rates* between nodes and update queue levels like water in pipes | Scales to high RPS at low compute cost | Aggregated flows can obscure tail latency and individual request behavior |
| **C. Discrete-Event Simulation (DES)** | Every request is an entity. The engine jumps from event to event ("request arrives at LB at t=1.0032s") | Models per-request latency, retries, timeouts, cache hits per key, and trace samples | CPU cost grows with RPS × hops |

### Proposed approach: DES core, with a hybrid option later

- **DES (C) is the primary engine.** The interesting lessons (p99 spikes, retry storms, timeouts cascading,
  hot keys) only show up when you simulate individual requests.
- **Analytical (A) is used as a validation reference.** Compare DES results with established queueing-theory
  results (see §2.10) to check that the engine behaves as expected for well-understood models. These checks
  validate specific cases; they do not prove correctness for every topology or workload.
- **Hybrid (B) comes later (Phase 4+)** for "internet-scale" problems (1M+ RPS). Nodes with very high
  throughput can switch to fluid mode while the rest stays discrete. Don't build it until profiling shows we need it.

### Initial performance estimate for JavaScript

The following back-of-envelope figures are hypotheses to measure during Phase 0, not established engine
benchmarks:
- A well-implemented JS DES with a binary-heap event queue handles roughly **3-10 million events/sec** in a Web Worker.
- A request crossing 5 hops generates about 10-15 events (arrive, start service, finish, send, receive...).
- So **~300k-1M requests per wall-clock second**, which covers 10k RPS at 30-100× real time.

**First measurement (Phase 0 benchmark, `pnpm bench`, Node.js 24 on one development machine):** about
6-7.5 million events/sec for clients → round-robin → 3-8 servers with lognormal service times. 60 s of
simulated time at 5,000 requests/second took about 80 ms of wall-clock time. Browser Web Worker performance
is not yet measured.

If measurements support these estimates, they may cover the initial problem set. For larger numbers, use
**scale presentation** only where equivalence has been validated: a problem can
say "100k RPS", while the scenario is designed so behavior at 10k RPS with 10× smaller capacities is
equivalent. (Careful: queueing behavior is *not* scale-invariant in general. With many parallel servers,
waiting time drops. So we only scale where we've verified equivalence, or we use the hybrid engine.)

---

## 2.2 Core concepts

```
Simulation
 ├── Clock                 (simulated time in microseconds, integer, never floats for time)
 ├── EventQueue            (min-heap keyed by (time, sequence) for deterministic ordering)
 ├── RNG                   (seeded PRNG, e.g. PCG32 / xoshiro128**, one stream per node)
 ├── Topology              (nodes + directed edges, from the user's design)
 ├── Nodes                 (each implements a behavior: LB, Server, Cache, DB, Queue...)
 ├── Links                 (latency + bandwidth + loss between two nodes)
 ├── Workload              (traffic generators: who sends what, how often)
 ├── Scenario              (timeline of events: traffic spikes, failures, deploys)
 └── Telemetry             (metrics, histograms, traces, particle samples for the UI)
```

### Hard rules

1. **Determinism.** Same design + same scenario + same seed means bit-identical results. Without it, grading
   isn't fair, bugs can't be reproduced, and replays can't be shared. Consequences:
   - Integer microsecond time, no `Date.now()`, no `Math.random()`.
   - Event ties broken by a monotonic sequence number.
   - A separate RNG stream per node, so adding a node doesn't change the random numbers other nodes draw.
     This matters: otherwise users see "I added an unrelated node and my DB latency changed".
   - Known limit: sampling distributions uses `Math.log`, `Math.exp` and `Math.sqrt`. The JavaScript
     specification requires `Math.sqrt` to be exact but allows `Math.log` and `Math.exp` to differ slightly
     between engines (V8, SpiderMonkey, JavaScriptCore). Results are reproducible on one engine; identical
     results across browsers would need engine-independent implementations of those functions.
2. **The engine is pure TypeScript with no DOM or Node runtime dependencies.** The same engine package can
   run in a browser Web Worker for interactive simulations and in Node.js for server-side grading.
3. **The engine knows nothing about rendering.** It emits telemetry, and the UI decides what to draw.

---

## 2.3 The request model

A request isn't a blob. It's an entity with properties that drive behavior:

```ts
interface SimRequest {
  id: number;
  traceId: number;           // root request id (sub-calls share it)
  op: OperationId;           // e.g. "GET /feed", "POST /tweet"
  key?: number;              // data key (drives cache hits, shard routing, hot keys)
  sizeBytes: number;         // request payload (drives network transfer time)
  responseSizeBytes: number;
  createdAt: Micros;
  deadline?: Micros;         // client timeout, propagated down the call chain
  attempt: number;           // retries are new attempts of the same logical request
  priority?: number;
  path: HopRecord[];         // only for sampled requests (tracing)
}
```

### Operations (request types)

Real traffic is a mix. A workload defines operations with weights:

```yaml
operations:
  - id: read_feed
    weight: 0.95             # 95% of traffic
    keyDistribution: { type: zipf, keys: 1_000_000, s: 1.1 }   # realistic popularity skew
    requestSize: 500B
    responseSize: { type: lognormal, median: 20KB, p99: 200KB }
  - id: post_tweet
    weight: 0.05
    kind: write
    requestSize: 2KB
```

**Why Zipf matters:** in real systems a small number of keys get most of the traffic (popular users, viral
posts). That's why caches work, and it's also why hot keys break sharded databases. With uniformly random
keys, caching would look ineffective and sharding would look perfectly balanced, and both conclusions
would be misleading.

---

## 2.4 Node behavior: how a request is processed

This is the hardest *design* problem in the whole product, because it's where realism and UX pull against each other.

### The problem

An edge `App Server → Cache` and an edge `App Server → Database` doesn't tell us *what the server does*.
In a real cache-aside pattern the server:
1. computes a bit (parse, auth): ~2 ms CPU
2. calls the cache
3. **if miss**, calls the DB, then writes to the cache
4. computes again (serialize response): ~1 ms CPU
5. responds

### Proposed model: declarative "handlers" with presets

Each node that runs logic (servers, workers) has a **handler per operation**: a small declarative pipeline.

```yaml
handler: read_feed
steps:
  - compute: { cpuMs: { lognormal: { median: 2, p99: 8 } } }
  - call: { target: cache, op: get }
    onMiss:
      - call: { target: db, op: select }
      - call: { target: cache, op: set, async: true }   # fire-and-forget
  - compute: { cpuMs: 1 }
```

Step types (keep the set small and powerful):

| Step | Meaning |
|---|---|
| `compute` | Use CPU for a sampled duration (holds a core) |
| `call` | Synchronous call to a downstream node (holds a concurrency slot, *not* a core, while waiting) |
| `call async` | Fire-and-forget (e.g. publish to queue) |
| `parallel` | Fan out N calls, wait for all, or for the first K (scatter-gather) |
| `branch` | Probabilistic or conditional (on cache miss, on error) |
| `respond` | Return to caller (implicit at the end) |

**UX strategy:** users almost never write handlers by hand. When you connect `Server → Cache → DB`, the
editor offers **pattern presets** ("Cache-aside", "Write-through", "Read from replica, write to primary")
that generate the handler. Advanced users can open the handler editor. That keeps problem 1 simple and
problem 40 expressive.

---

## 2.5 Resource model for a server

Real servers are limited by several things at once. Each one teaches a different lesson.

| Resource | Model | What the user learns |
|---|---|---|
| **CPU cores** | `c` cores. `compute` steps queue for a core (M/G/c-like) | Vertical scaling, CPU saturation |
| **Concurrency slots** | Max in-flight requests (thread pool / connections). A slot is held for the *whole* request, including waits on downstream calls | Why a slow DB exhausts your app server's threads even though its CPU is idle. A classic cascading-failure lesson. |
| **Accept queue** | Bounded queue in front of slots. Full → reject (HTTP 503) | Back-pressure, load shedding |
| **Memory** | Base usage + per-in-flight-request memory. Exceed → OOM crash → restart after N seconds | Why unbounded queues kill servers |
| **Network bandwidth (NIC)** | Bytes/sec, egress transfer time | Large payloads, why CDNs matter |

Concurrency model is a config option, because it's a real-world distinction worth teaching:
- **Thread-per-request** (Java/Spring classic): slots = thread pool size, e.g. 200.
- **Event loop / async** (Node, Go): slots very high, CPU is the bottleneck.

### Service-time distributions

Never use constant service times. Real latencies are **right-skewed**: most requests are fast, a few are
very slow. Use:
- **Lognormal** for compute and DB queries (configured by median + p99, which is intuitive for users)
- **Exponential** only where we validate against theory
- Optional **GC pauses / noisy neighbor** stalls as rare large spikes

This is what makes p99 ≫ p50, which is one of the most important lessons in the product.

---

## 2.6 Network model

Each edge (link) has:

```
transferTime = propagationLatency + (bytes / bandwidth) + jitter
```

| Placement | Typical one-way latency |
|---|---|
| Same host | ~0.05 ms |
| Same availability zone (AZ) | ~0.25 ms |
| Cross-AZ, same region | ~0.5-1 ms |
| Cross-region, same continent | ~10-30 ms |
| Cross-continent (US ↔ EU) | ~40-50 ms |
| User → nearest edge/CDN | ~5-20 ms |
| User → far region | ~50-150 ms |

**Placement drives latency automatically.** Each node is placed in a region/AZ (visually: grouped boxes on
the canvas), and link latency is derived from placement. Users don't type latencies. They move a server to
`eu-west` and watch the numbers change. (Override is possible in Sandbox.)

Optional per link: packet loss % (triggers TCP-ish retransmit delay), and partition events (link down) from chaos scenarios.

---

## 2.7 Reliability mechanics (where the real lessons are)

These are what make the product feel professional rather than a toy. Each one is a configurable behavior:

| Mechanic | Where configured | Emergent lesson |
|---|---|---|
| **Client timeouts** | Clients, servers' outbound calls | Without them, stuck requests hold slots forever |
| **Retries** with backoff + jitter | Clients, outbound calls | **Retry storms**: naive retries turn a 2× overload into a 6× overload |
| **Retry budget** | Outbound calls | The fix for retry storms |
| **Circuit breaker** | Outbound calls | Fail fast, let a dependency recover |
| **Health checks** | Load balancer | Dead nodes keep receiving traffic until they're detected (detection delay!) |
| **Rate limiting** (token bucket) | API gateway, LB | Protecting the system vs. rejecting users |
| **Load shedding** | Server accept queue | Better to serve 80% fast than 100% never |
| **Autoscaling** | Server groups | Scaling **lag** (new instances take 60-180 s to boot): why you scale before the spike |
| **Replication** | Databases | Failover time, replication lag, stale reads |
| **Deadline propagation** | Calls | Don't do work for a client that already gave up |

The scenario timeline (traffic spikes, node kills, slowdowns) is what triggers these. See §2.9.

---

## 2.8 Caching model

Cache behavior can be modeled in two ways:

1. **Exact LRU simulation**: track actual keys in an LRU structure. Correct, but memory-heavy for millions of keys.
2. **Analytical hit ratio (Che's approximation)**: given a cache size, a key popularity distribution (Zipf)
   and an eviction policy, compute the steady-state hit probability per key. Cheap and well validated in research.

For the initial model, use exact LRU when the key space is at most about one million keys, and Che's
approximation for larger key spaces. Validate the crossover with memory and performance benchmarks.
Both produce *emergent* hit ratios: users never type "hit ratio = 90%". They choose cache size (GB) and the
hit ratio falls out of the workload. That's the lesson: a 2 GB cache gives 85%, an 8 GB cache gives 93%,
and the cost difference is X. Is that worth it?

Also model: TTL expiry, cold start (empty cache after restart → **thundering herd** onto the DB), and write invalidation.

---

## 2.9 Workload & scenario

### Traffic generators

| Pattern | Use |
|---|---|
| Poisson arrivals at rate λ | Default. Realistic for many independent users. |
| Constant rate | Debugging only |
| Ramp | Find the breaking point |
| Diurnal curve | Daily cycle, for autoscaling problems |
| Spike / flash crowd | "Product launch", "celebrity tweet" |
| Bursty (Markov-modulated) | Real traffic is burstier than Poisson; advanced problems |
| Closed-loop users | N users each send a request, wait, think, repeat. Important nuance: closed-loop systems self-throttle and hide overload. Open-loop doesn't. Worth one problem. |

### Scenario timeline

A scenario is a script over simulated time:

```yaml
duration: 120s
warmup: 10s                    # exclude from metrics (caches filling, etc.)
events:
  - at: 0s    traffic: { rps: 2000 }
  - at: 30s   traffic: { rps: 8000, rampOver: 5s }    # spike
  - at: 60s   fail: { node: db-primary, mode: crash }
  - at: 90s   recover: { node: db-primary }
```

Problems ship with a **visible scenario** (what the user runs) and **hidden scenarios** (used in grading,
like hidden test cases). See [Problems & grading](05-problems-and-grading.md).

---

## 2.10 Validation against analytical results

The validation suite compares simulation output with analytical results for well-understood models. These
tests check specific behaviors and do not prove correctness for every topology or workload:

| Test | Known result | Tolerance |
|---|---|---|
| M/M/1 queue, ρ = 0.5, 0.8, 0.9, 0.95 | Mean time in system W = 1/(μ − λ) | within 2% over long runs |
| M/M/c (Erlang C) | Probability of waiting, mean wait | within 2% |
| Little's Law on every node | L = λ·W (in-flight = arrival rate × time in system) | within 1% |
| M/M/1/K (bounded queue) | Blocking probability | within 2% |
| Cache with Zipf + LRU | Che's approximation | within 3% |
| Load balancer round-robin, N equal servers | Equivalent to N independent M/M/1 at λ/N | within 2% |

Plus:
- **Determinism tests**: same seed → identical event log hash.
- **Property-based tests** (fast-check): conservation (every request ends exactly once: success, error, or
  timeout), no negative queue lengths, monotonic time.
- **Golden scenario tests**: canonical designs with snapshot metrics, to catch unintended behavior changes
  when we tune the engine. Engine changes that alter golden outputs require an explicit version bump
  (graded submissions record the engine version).

---

## 2.11 Telemetry: what the engine emits

The engine emits three streams, at different fidelities:

1. **Metrics (aggregated, always on)**
   - Per node and per edge, in rolling sim-time windows: throughput, errors by type, utilization, queue depth, in-flight, memory.
     Results are collected in 250 ms buckets of simulated time, and a window (up to the last 10 s) combines the
     most recent buckets. A long-running interactive simulation therefore shows what is happening *now*;
     totals since the start would hide a recent spike behind earlier normal traffic.
   - Latency histograms with **HDR Histogram or DDSketch**, so p50/p95/p99/p999 are accurate and mergeable.
     Never compute percentiles by averaging.
   - End-to-end client-observed latency (this is what SLOs are judged on).
   - Cost accumulator.
2. **Particles (sampled, for animation)**: see §2.12.
3. **Traces (sampled, on demand)**: full hop-by-hop records for ~0.1% of requests, plus *all* failed
   requests up to a cap. Powers the "click a request, see its waterfall" feature, like Jaeger/Zipkin.

---

## 2.12 Simulation time vs. animation time

At 5,000 RPS, rendering every request hop would produce too many particles for an effective visualization.
Simulation and animation therefore use separate levels of detail:

- **Speed control**: 0.1× (slow motion to watch individual requests) ... 1× ... 100× (fast-forward a 10-minute scenario).
- **Particle sampling**: the engine emits particles for a sample of requests, targeting a fixed visual
  budget (e.g. ≤ 1,500 on-screen particles). A sampled request reports each hop along a connection and its
  outcome (processed or rejected) at the node that finished it. The current implementation:
  - The caller sets a target number of sampled requests per simulated second, per traffic source, so a
    quiet source still shows particles next to a busy one.
  - Requests are sampled at random from a dedicated random stream. Turning particles on or off never
    changes the simulation's results. Evenly spaced sampling (every n-th request) is avoided because it
    lines up with regular patterns such as round robin and leaves some connections without particles.
  - Hops take no simulated time until links have latency (§2.6). The UI animates each hop over a short
    visual duration.
  - Later: **particle density per edge proportional to (log-scaled) throughput**, so busy paths look busy.
- Particles carry **status color** (ok / slow / error / retry), so a failing path turns red visibly.
- **Queue visualization**: dots stack up at the node entrance as its queue grows, making congestion visible.

The worker sends compact frames (typed arrays, ~30 Hz) to the UI: `[edgeId, progress, status]` per particle,
and node state snapshots. No JSON per request.

---

## 2.13 Performance plan

- Binary heap event queue to start; move to a pairing heap or calendar queue only if profiling says so.
- Object pooling for requests and events (avoid GC churn, which matters a lot in JS).
- Struct-of-arrays / typed arrays in hot paths if needed.
- An event budget per frame in interactive mode, so the UI never freezes; the sim runs ahead in chunks.
- Interactive runs advance simulated time in slices. Slicing does not change results: running 12 s in
  one step or in 120 steps of 100 ms produces identical metrics. Traffic changes take effect at the
  simulated time they are applied, so a recorded sequence of changes replays exactly.
- Benchmarks in CI (events/sec on a reference topology) to catch performance regressions.
- If JS ever becomes the bottleneck, the engine boundary is clean enough to port the core to Rust → WASM
  without touching the UI. **Don't start there.** TS is easier to iterate on while the model is still changing.

---

## 2.14 Engine versioning

Every saved design and every graded submission records `engineVersion`. When we improve realism, old
results stay reproducible (old engine versions remain runnable server-side for a deprecation window),
and leaderboards are per engine major version.
