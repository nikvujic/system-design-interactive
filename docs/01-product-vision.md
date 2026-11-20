# 1. Product Vision

## 1.1 One-sentence pitch

> **Learn system design by building systems that actually break, then fixing them, instead of drawing boxes on a whiteboard and hoping.**

## 1.2 The problem we solve

System design is commonly learned through books and blogs, mock interviews, and experience on production
systems. Each format has limitations for experimenting with design choices:

| How people learn today | The gap |
|---|---|
| Books and blogs | Explanations may not show the consequences of a decision under a workload. |
| Mock interviews / whiteboarding | Feedback depends on the interviewer and may not include workload-based evaluation. |
| Production experience | Failures provide real feedback but carry operational cost and risk. |

The product provides an interactive feedback loop: build a design, run it against a workload, inspect the
results, and iterate.

## 1.3 Target users (in priority order)

1. **Engineers preparing for system design interviews.** A focused initial audience with a clear use case.
2. **Mid-level engineers growing into senior roles.** They want intuition: *why* does the p99 blow up at 80% utilization?
3. **Educators and bootcamps.** Later: classroom mode and custom problem sets.

Design for (1) and (2). Don't build for (3) until there's traction.

## 1.4 Product pillars

1. **Faithful, not perfect.** The simulation has to produce the same *qualitative* behavior as real systems:
   queues explode non-linearly near saturation, retries amplify outages, caches shift load, replicas lag.
   We are not trying to predict AWS bills to the cent. We are trying to never teach something false.
2. **Visible.** Every important number can be seen *and* felt: dots piling up, nodes turning red, charts spiking.
3. **Judged by outcomes, not by shape.** A solution passes if it meets its SLOs (latency, errors, availability, cost)
   under the scenario, not because it matches a reference diagram. Multiple valid designs exist and should all pass.
4. **Constrained by cost.** Without a budget every problem is solved by "add 500 servers". Cost is what makes
   design a trade-off, so it is a first-class metric in every problem.
5. **Progressive.** The first problem takes 2 minutes and teaches one idea. The last one takes an hour and combines twenty.

## 1.5 Core user loop

```
Read problem ──► Inspect starting design ──► Run simulation ──► See it fail (why?)
      ▲                                                               │
      │                                                               ▼
 Next problem ◄── Submit ◄── Meets SLOs locally ◄── Modify design / config
                     │
                     ▼
        Server grades against hidden scenarios ──► Score (pass + cost efficiency percentile)
```

## 1.6 Product surfaces

| Surface | Description | Phase |
|---|---|---|
| **Sandbox** | Free-form editor. Any components, any traffic, no grading. The foundation everything else is built on. | MVP |
| **Problem mode** | Locked starting design + scenario + SLO targets + hidden test scenarios. | MVP |
| **Learn cards** | Short explanation attached to each concept (e.g. "What is a load balancer?"), shown in-context. | MVP-lite |
| **Chaos mode** | Inject failures mid-run: kill a node, slow a DB, lose an availability zone. | v1 |
| **Shareable designs** | Public link to a design + replayable run. Good for growth. | v1 |
| **Leaderboards / percentiles** | "Your design is cheaper than 87% of passing submissions." | v1 |
| **Community problems** | User-authored problems with review. | Later |

## 1.7 Scope: what the simulator can and cannot teach

Being honest about this early prevents scope creep and misleading users.

**Can teach well (quantitative, simulatable):**
- Capacity and scaling (vertical vs horizontal, load balancing, autoscaling)
- Latency (network hops, regions, CDNs, caching, tail latency)
- Queueing and back-pressure (async processing, message queues, rate limiting)
- Reliability (redundancy, failover, timeouts, retries, circuit breakers, cascading failures)
- Data tier scaling (read replicas, sharding, hot keys, replication lag, connection pools)
- Cost trade-offs

**Can teach partially (simulatable with simplifications):**
- Consistency trade-offs (we can show stale reads and replication lag, not formally verify linearizability)
- Partitioning strategies (hash vs range, hotspots)
- Data volume growth (storage filling up over simulated months)

**Cannot teach via simulation (handle with text/quiz content, or leave out):**
- API design, data modeling and schema design
- Security and auth flows
- Specific algorithms (e.g. how a geohash works), but we can simulate their *performance profile*

> **Implication:** a classic interview question like "Design Twitter" can't be one problem. It becomes a
> **problem track** of 5-8 simulatable sub-problems: timeline reads at scale, fan-out on write vs read,
> celebrity hot keys, media via CDN, and so on. See [Problems & grading](05-problems-and-grading.md).

## 1.8 Non-goals (for now)

- Generating real infrastructure code (Terraform etc.). Tempting, but it's a different product.
- Exact cloud-vendor fidelity (specific EC2 instance types, real AWS pricing APIs). We use *representative* tiers.
- Multiplayer real-time collaboration.
- Mobile editing. The editor is desktop-only; mobile can view designs and results.

## 1.9 Success metrics

| Metric | Why it matters |
|---|---|
| % of new users who complete problem 1 | Onboarding quality |
| Median runs per submitted solution | Healthy is 3-10. 1 means too easy, 50 means confusing feedback. |
| Track completion rate | Content difficulty curve |
| "Simulation felt realistic" survey score, especially from senior engineers | The product is only useful if experienced engineers trust its results |
