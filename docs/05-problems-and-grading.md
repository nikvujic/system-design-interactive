# 5. Problems & Grading

## 5.1 Content strategy and originality

1. **Research topics; create original material.** Common prompts such as "Design a URL shortener" can
   inform topic selection. Specific site write-ups, diagrams, and solutions should not be copied. Research
   should identify themes and relative frequency; problem narratives, designs, and solutions should be
   original.
2. **Interview questions aren't directly simulatable.** A broad prompt such as "Design YouTube" is a
   conversation, not a single simulation. Decompose it into a track of focused, simulatable problems
   (see §5.4).
3. **Concept-first content supports progressive learning.** Two kinds of content:
   - **Concept track** (foundations): load balancing, caching, queues, replication... Each problem teaches one idea.
   - **Case-study tracks** ("Design a URL shortener", "Design a news feed"): combine concepts under realistic constraints.

## 5.2 Anatomy of a problem

```yaml
id: lb-01-too-many-users
version: 3
title: "One Server Isn't Enough"
track: foundations
difficulty: 1            # 1-10
engineVersion: ^1.0
concepts: [horizontal-scaling, load-balancer]
unlockedComponents: [clients, server, load_balancer]

story: |                 # MDX: the narrative + context + what to read
  Your app just got featured. Traffic jumped from 300 to 2,000 requests per second...

startingDesign: ./start.design.json     # what the user sees first; locked nodes are marked
lockedNodes: [clients]                  # user can't delete or reconfigure traffic

visibleScenario: ./scenarios/visible.yaml
hiddenScenarios:                        # grading only, never sent to client
  - ./scenarios/hidden-steady.yaml
  - ./scenarios/hidden-spike.yaml       # e.g. 20% higher peak, different seed

slos:                                   # pass criteria (all must hold, measured after warmup)
  - metric: latency.p99      target: "< 300ms"
  - metric: error_rate       target: "< 0.1%"
  - metric: cost.monthly     target: "< $400"

scoring:                                # beyond pass/fail
  primary: cost.monthly                 # lower is better → percentile vs other passing solutions
  secondary: latency.p99

hints:                                  # progressive disclosure
  - "Look at the server's CPU utilization. What happens above ~80%?"
  - "Can you split traffic between multiple servers?"
referenceSolutions: [./solutions/two-servers-lb.design.json]
postSolveReading: ./learn/load-balancing.mdx   # deeper explanation, unlocked after solving
```

## 5.3 Grading model

### Principle: judge outcomes, not shapes

The grader **doesn't compare your diagram with the reference.** It runs your design against the hidden
scenarios and checks SLOs. Any design that meets them passes. This mirrors reality and allows creative
solutions (e.g. a user solves a read-scaling problem with a cache instead of read replicas, and that's fine
if it meets the budget).

### Pipeline

```
Submit ─► validate design (schema, unlocked components, locked nodes untouched)
       ─► enqueue grading job
       ─► for each hidden scenario × N seeds (e.g. 3 seeds):
              run engine headless
              collect metrics after warmup
       ─► SLO check per scenario (all must pass, reporting the worst seed)
       ─► score: cost + latency + (optional) resilience
       ─► store result, update percentiles, return report
```

### Why multiple seeds and hidden scenarios

- **Multiple seeds:** a design that passes p99 < 300 ms with one random seed but fails with another is
  sitting on the edge. Real systems need headroom. Grading on the worst of 3 seeds rewards robust designs.
- **Hidden scenarios:** prevents overfitting to the visible run (e.g. sizing for exactly 2,000 RPS when
  the story says "around 2,000"). The story must honestly describe what hidden scenarios test ("traffic
  may peak 20% higher", "expect one server failure"). **Hidden must never mean unfair.**

### Result report (the most important learning moment)

A failed submission must explain *why*, not only "failed":

```
✗ Scenario "Peak traffic" — p99 latency 1,840 ms (target < 300 ms)
   Bottleneck detected: db-primary — CPU 98% from t=32s, connection pool exhausted at t=35s
   Suggestion: [learn card] "Read replicas" · [learn card] "Caching"
✓ Scenario "Steady state"
```

**Automatic bottleneck detection** (heuristics over telemetry: first node to saturate, longest queue,
highest error source) is a high-value feature. It's what turns a simulator into a teacher.

### Anti-cheese rules

Users will try degenerate solutions. Guardrails:
- Cost ceilings in every problem (no "100 XL servers").
- Locked nodes (can't reduce the client traffic or set a 0 ms timeout).
- SLOs measured at the **client**, so dropping requests counts as errors.
- Load shedding is allowed (it's a real technique) but counts toward error rate.

## 5.4 Example: decomposing "Design a URL Shortener" into a track

| # | Problem | Concept | Starting point → expected direction |
|---|---|---|---|
| 1 | Redirects are slow | Caching | Server → DB at 5k RPS reads; add cache, hit ratio emerges from Zipf links |
| 2 | Viral link | Hot keys | One link gets 40% of traffic; cache replication / local in-process cache |
| 3 | Global users | CDN / multi-region | EU and APAC users see 200 ms; push redirects to the edge |
| 4 | ID generation at scale | Write scaling | Writes bottleneck on a single DB sequence; pre-allocated ranges / sharding |
| 5 | Analytics without slowing redirects | Async processing | Click logging synchronously doubles latency; move to queue + workers |
| 6 | Survive a region outage | HA & failover | Scenario kills a region at t=60s |

Each problem is small, simulatable and teaches one thing. Together they form "the URL shortener interview answer".

## 5.5 Proposed initial curriculum (Foundations track, ~15 problems)

| # | Problem idea | Concept |
|---|---|---|
| 1 | One server, too many users | Horizontal scaling + load balancer |
| 2 | Bigger box or more boxes? | Vertical vs horizontal, cost |
| 3 | Why is p99 so bad at 85% CPU? | Utilization vs latency (queueing) |
| 4 | Round robin isn't fair | LB algorithms with uneven request costs |
| 5 | The database is the bottleneck | Read replicas |
| 6 | Cheaper than replicas | Caching, cache sizing |
| 7 | The cache restarted... | Thundering herd, cache warming |
| 8 | Black Friday | Queues to absorb spikes |
| 9 | Slow DB takes down the app | Timeouts, thread pool exhaustion |
| 10 | Retries made it worse | Retry storms, backoff + jitter, retry budget |
| 11 | Fail fast | Circuit breakers |
| 12 | A server died at 3am | Redundancy, health checks |
| 13 | Traffic grows every morning | Autoscaling and its lag |
| 14 | Users in Europe complain | Regions, latency, CDN |
| 15 | Too many connections | Connection pooling |

Then case-study tracks: URL shortener, Rate limiter, News feed, Chat/messaging, Video streaming,
Ride sharing (geo), Web crawler, Notification system, Payment system (idempotency focus), Ticket booking (contention).

## 5.6 Content pipeline & quality gates (CI)

Every problem in `packages/content` must pass automated checks:
1. Schema-valid YAML/MDX.
2. **Starting design fails** at least one SLO (otherwise the problem is trivial).
3. **Every reference solution passes** all hidden scenarios across all grading seeds, with margin.
4. A "naive cheese" design (e.g. max-tier everything) **fails** on cost.
5. Grading runtime within budget (e.g. < 5 s per scenario).
6. Re-run on every engine version change, so engine tweaks can't silently break problems.

Authoring tool (internal, later): problem authoring happens *in the app itself*. Build the design in
Sandbox, export as starting design / reference solution.

## 5.7 Difficulty calibration

Initial difficulty is assigned by the author, then recalibrated from data: solve rate, median attempts,
time-to-solve. Same approach as competitive programming platforms.
