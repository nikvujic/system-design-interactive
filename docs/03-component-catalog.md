# 3. Component Catalog

Every block a user can place, what it's configured with, how it behaves in the simulation, and
**realistic default numbers**.

> **On numbers:** defaults are initial estimates, not vendor specifications. Before release, document each
> default's source and assumptions in a `calibration.md` file and review values for consistency.

Components are introduced progressively: problem 1 only unlocks `Clients`, `Server` and `Load Balancer`.
The full palette is only available in Sandbox and later problems.

---

## 3.1 Common properties (all components)

| Property | Notes |
|---|---|
| `name` | User label |
| `region` / `az` | Placement: drives link latency and failure domains |
| `tier` | Size preset (S/M/L/XL): sets capacity and cost together, so users can't max one without paying for it |
| `replicas` | For components that support horizontal scaling (rendered as a stacked node with ×N badge) |
| `cost` | Derived from tier × replicas × hours, plus data transfer. Shown live. |

**Tiers instead of raw numbers:** users choose `Server: Medium (4 vCPU, 8 GB, $X/mo)` rather than typing
`cpu: 4`. That's realistic (cloud instance types work this way) and keeps cost coupled to capacity.
Sandbox allows a "Custom" tier for experiments.

---

## 3.2 Traffic sources

### Clients / Users
| Config | Default | Notes |
|---|---|---|
| Traffic pattern | Poisson | See engine §2.9 |
| RPS (or concurrent users for closed-loop) | 100 | |
| Operation mix | 1 op | read/write ratio etc. |
| Geographic distribution | 100% one region | e.g. 50% NA, 30% EU, 20% APAC. Drives CDN/multi-region problems. |
| Timeout | 10 s | Client-side |
| Retry policy | none | Configurable: count, backoff, jitter |

Output metric that matters most: **client-observed latency and success rate**. This is "what the user feels".

---

## 3.3 Edge & networking

### DNS (simple)
Routes users to a region (latency-based, geo, or weighted). Adds ~one-time resolution latency (cached). Mostly relevant for multi-region and failover problems.

### CDN
| Config | Default |
|---|---|
| Cacheable fraction of responses | per op |
| Edge cache size | per tier |
| TTL | 1 h |
| Edge latency to user | 5-20 ms |

Behavior: hit → served at edge (fast, cheap); miss → forwarded to origin. Teaches static asset offloading and egress cost savings.

### Load Balancer
| Config | Default | Options |
|---|---|---|
| Layer | L7 | L4 / L7 (L7 adds ~0.5-1 ms but enables path routing) |
| Algorithm | Round robin | Round robin, least connections, random, **power of two choices**, consistent hash (sticky) |
| Health check interval / threshold | 5 s / 2 failures | Determines how long a dead backend keeps getting traffic |
| Capacity | very high (tier-dependent) | LBs rarely bottleneck, but they can |

Teaching note: least-connections vs round robin matters a lot when backends are **heterogeneous** or
service time variance is high. That deserves its own problem.

### API Gateway
LB plus **rate limiting** (token bucket per client / global), auth cost (CPU per request), request routing by operation.

---

## 3.4 Compute

### Server (App Server)
| Config | Default (Medium tier) | Notes |
|---|---|---|
| vCPU | 4 | |
| Memory | 8 GB | |
| Concurrency model | thread pool (200) | or async/event loop |
| Accept queue size | 100 | Beyond → 503 |
| Per-request memory | 2 MB | |
| Handlers | from preset | See engine §2.4 |
| Boot time | 90 s | Matters for autoscaling and recovery |
| Outbound call policy | timeout 1 s, no retry | Timeouts, retries, circuit breaker |

Realistic throughput intuition: a typical CRUD API endpoint needs ~2-10 ms CPU per request, so ~400-2,000 RPS per 4 vCPU box.

### Server Group (Auto Scaling Group)
A server with `replicas` plus scaling policy: target CPU %, min/max instances, cooldown, boot time. Teaches scaling lag.

### Serverless Function (later)
Per-invocation billing, near-unlimited concurrency, **cold starts** (100 ms-1 s+), concurrency limits. Good contrast problem against servers.

### Worker (Queue Consumer)
Like a server, but pulls from a queue at its own pace. Configured with concurrency and handlers.

---

## 3.5 Data stores

### Cache (Redis/Memcached-like)
| Config | Default |
|---|---|
| Memory size | 4 GB |
| Eviction policy | LRU (LFU, TTL-only) |
| TTL | 5 min |
| Op latency | ~0.1-0.5 ms + network |
| Throughput per node | ~100k ops/s (single-threaded model) |
| Mode | single / replicated / clustered (sharded) |

Hit ratio is **emergent**: it comes from size + key distribution + TTL. See engine §2.8.

### Relational Database (Postgres/MySQL-like)
| Config | Default (Medium) | Notes |
|---|---|---|
| vCPU / memory | 4 / 16 GB | |
| Max connections | 200 | Connection exhaustion is a classic failure |
| Point read latency | ~1 ms (in buffer) / ~5 ms (disk) | Buffer hit ratio depends on working set vs memory |
| Write latency | ~2-5 ms (fsync, WAL) | |
| Throughput | ~5-15k simple reads/s, ~1-5k writes/s per Medium node | Rough, tier-scaled |
| Read replicas | 0 | Async replication with **replication lag** (ms → seconds under load) |
| Failover | manual | auto: ~30 s promotion with data-loss window |
| Sharding | off | hash / range by key: **hot shards** emerge from Zipf keys |

### NoSQL / Key-Value Store (DynamoDB/Cassandra-like)
Partitioned by key, horizontally scalable, per-partition throughput limits (hot partitions!),
tunable consistency (read your quorum: latency vs staleness).

### Object Storage (S3-like)
High latency (~20-100 ms first byte), effectively infinite throughput and capacity, cheap storage,
**egress cost**. Usually paired with a CDN.

### Search Index (later)
Elasticsearch-like: expensive queries, indexing lag.

---

## 3.6 Asynchronous messaging

### Message Queue (SQS/RabbitMQ-like)
| Config | Default |
|---|---|
| Max depth | unbounded (configurable) |
| Visibility timeout | 30 s |
| Delivery | at-least-once |
| Dead-letter queue | off |

Key metrics: **queue depth, consumer lag (oldest message age)**, end-to-end processing time.
Teaches: absorbing spikes, decoupling, and the fact that a queue hides overload until it doesn't.

### Log / Stream (Kafka-like) (later)
Partitions, consumer groups, ordering per partition, retention, throughput per partition. Teaches partition count as a parallelism cap.

---

## 3.7 Observability blocks (optional, maybe never)

Real systems have monitoring, but here **the app itself is the monitoring**: every node shows metrics.
No block needed.

---

## 3.8 Failure modes per component (for chaos & scenarios)

| Component | Failure modes |
|---|---|
| Server | crash, slow (CPU steal), memory leak, bad deploy (error rate %) |
| LB | (rare) crash, health check misconfig |
| Cache | crash (cold restart → thundering herd), eviction storm |
| DB | primary crash (failover), slow queries, replication lag spike, disk full |
| Queue | consumer crash (backlog grows) |
| Network | link latency increase, packet loss, partition |
| Region/AZ | entire failure domain down |

---

## 3.9 Cost model

Simple, transparent, representative (not tied to one vendor's live pricing):

```
monthlyCost = Σ (tierHourlyPrice × replicas × 730)
            + dataTransferGB × egressPrice
            + storageGB × storagePrice
            + requests × perRequestPrice   (serverless, managed queues, object storage)
```

Prices are roughly calibrated to public cloud on-demand pricing and stored in one versioned config file.
Displayed as "$/month at this traffic level". Cost is part of every problem's score.

---

## 3.10 Component rollout order

| Wave | Components | Unlocks problems about |
|---|---|---|
| 1 (MVP) | Clients, Server, Load Balancer, Database, Cache | Scaling, LB algorithms, caching, read replicas, connection pools |
| 2 | Queue, Worker, CDN, Object Storage, API Gateway | Async processing, static content, rate limiting |
| 3 | Regions/AZs, DNS, Server Group (autoscaling), chaos events | High availability, failover, autoscaling |
| 4 | Sharding, NoSQL, Kafka-like stream, Serverless | Partitioning, hot keys, event-driven architectures |
| 5 | Search, multi-region data replication | Global systems |
