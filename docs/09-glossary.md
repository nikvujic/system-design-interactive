# 9. Glossary

Plain-language definitions of the concepts used in these docs. Many of these will also become in-app learn cards.

## Traffic & performance

- **RPS / QPS**: requests (queries) per second. The basic unit of load.
- **Throughput**: how many requests the system actually *completes* per second. If throughput < incoming RPS, something is queuing or failing.
- **Latency**: time from sending a request to getting the response.
- **Percentiles (p50, p95, p99)**: sort all request latencies; p99 is the value 99% of requests are faster than. **p50** = typical user, **p99** = the unlucky 1%. At scale the 1% is a lot of people, and one page load may make 50 requests, so most users hit a p99 somewhere. That's why companies set targets on p99, not averages.
- **Tail latency**: the slow end of the distribution (p99, p999).
- **SLO (Service Level Objective)**: a target like "p99 < 300 ms and 99.9% success". Problems are graded on SLOs.
- **Utilization (ρ)**: fraction of time a resource is busy. 0.8 = 80% busy.
- **Saturation**: the resource is at 100%, so work queues up.

## Queueing (the math behind "why it gets slow")

- **Queue**: requests waiting for a free worker/CPU.
- **Little's Law**: `L = λ × W`: average number in the system = arrival rate × average time in system. Holds for any stable system. Used everywhere for capacity planning.
- **M/M/1, M/M/c**: standard queue models (random arrivals, random service times, 1 or c servers). Their key lesson: **wait time grows non-linearly with utilization.** In an M/M/1 queue, the average time a request spends in the system (waiting plus service) is 5× longer at 90% utilization than at 50%, and 50× longer at 99%. That's why servers are not run near 100%.
- **Poisson arrivals**: the standard model for many independent users sending requests randomly.
- **Back-pressure**: a slow component signals upstream to slow down instead of being overwhelmed.
- **Load shedding**: deliberately rejecting some requests when overloaded, so the rest stay fast.

## Scaling

- **Vertical scaling (scale up)**: bigger machine. Simple, but limited and expensive at the top.
- **Horizontal scaling (scale out)**: more machines behind a load balancer. Needs **stateless** servers.
- **Stateless service**: keeps no user data in its own memory between requests, so any instance can handle any request.
- **Load balancer (LB)**: distributes requests across servers. **L4** works on TCP connections (fast, blind to content); **L7** understands HTTP (can route by path, header).
- **Round robin / least connections / power of two choices**: LB strategies. P2C: pick 2 random servers, send to the less busy one. Surprisingly close to optimal.
- **Autoscaling**: automatically adding/removing servers based on load. New servers take time to boot, so autoscaling reacts with **lag**.

## Data

- **Cache**: fast in-memory store (Redis, Memcached) holding copies of frequently read data.
- **Cache hit ratio**: % of reads served from cache. 90% hit ratio = the DB sees only 10% of reads.
- **Cache-aside**: app checks cache → on miss reads DB → writes result to cache. The most common pattern.
- **Write-through**: writes go to cache and DB together.
- **TTL (time to live)**: how long a cached entry is valid.
- **Eviction (LRU, LFU)**: when the cache is full, remove least-recently / least-frequently used items.
- **Thundering herd / cache stampede**: cache empties (restart, expiry), so all requests hit the DB at once and the DB falls over.
- **Zipf distribution**: popularity skew where a few items get most of the traffic. Real-world access patterns look like this.
- **Hot key / hot partition**: one key (a celebrity's profile) gets so much traffic that the single node holding it is overloaded.
- **Read replica**: a copy of the database that serves reads; the primary handles writes and streams changes to replicas.
- **Replication lag**: delay before a write on the primary appears on replicas. Reading from a replica can return **stale** data.
- **Sharding (partitioning)**: splitting data across multiple databases by key (e.g. user_id). Scales writes, but adds complexity.
- **Consistent hashing**: a way of assigning keys to shards so adding/removing a shard moves only a small fraction of keys.
- **Connection pool**: a fixed set of reusable DB connections. DBs support limited connections; too many app servers can exhaust them.
- **Consistency (strong vs eventual)**: strong = every read sees the latest write; eventual = reads may be briefly stale but converge.
- **CAP theorem**: during a network partition, a distributed system must choose between consistency and availability.

## Async & messaging

- **Message queue**: a buffer where producers put work and consumers process it later. Smooths spikes and decouples services.
- **Consumer lag**: how far behind consumers are (queue depth or age of the oldest message).
- **At-least-once delivery**: messages may be delivered more than once, so consumers must be **idempotent** (processing twice has the same effect as once).
- **Dead-letter queue (DLQ)**: where messages go after failing repeatedly.
- **Stream / log (Kafka)**: an ordered, durable, replayable sequence of events split into **partitions**.

## Reliability

- **Availability**: % of time the system works. "Three nines" (99.9%) ≈ 8.8 hours of downtime per year; "four nines" ≈ 53 minutes.
- **Redundancy**: running more than one copy so a failure doesn't cause an outage.
- **Failure domain**: things that fail together (a server, a rack, an **availability zone (AZ)**, a **region**).
- **Availability zone**: an isolated datacenter within a region. Spreading across AZs survives a datacenter outage.
- **Failover**: switching to a backup when the primary fails. Takes time, and may lose recent data.
- **Health check**: the LB periodically pings servers and stops sending traffic to unhealthy ones.
- **Timeout**: give up waiting after X ms. Without timeouts, slow dependencies hold your resources forever.
- **Retry with exponential backoff + jitter**: retry after 100 ms, 200 ms, 400 ms... with randomness, so clients don't retry in sync.
- **Retry storm**: everyone retries a struggling service at once, multiplying its load and keeping it down.
- **Circuit breaker**: after many failures, stop calling a dependency for a while (fail fast), then test it again.
- **Cascading failure**: one component's failure overloads others, which fail in turn.
- **Rate limiting**: capping how many requests a client can make (e.g. token bucket).
- **Graceful degradation**: serving a reduced experience (cached/stale data, fewer features) instead of failing completely.

## Network & edge

- **RTT (round-trip time)**: time for a packet to go there and back. Bounded by the speed of light: US ↔ EU ≈ 80-90 ms RTT.
- **Bandwidth**: bytes/sec a link can carry. Large payloads take time even on fast links.
- **CDN (Content Delivery Network)**: servers at the "edge" near users caching static content (images, video, JS), which cuts latency and origin load.
- **Egress cost**: cloud providers charge for data leaving their network. Often a big part of the bill for media-heavy apps.
- **DNS**: translates domain names to IPs; can also route users to the nearest/healthy region.

## Simulation terms (ours)

- **Discrete-Event Simulation (DES)**: simulating a system by jumping from event to event ("request arrives at t=1.2034s") instead of ticking a clock.
- **Seed**: starting number for the random generator. Same seed = same "random" run, which makes results reproducible.
- **Scenario**: a scripted timeline of traffic and failures for a simulation run.
- **Warmup**: initial period excluded from metrics (caches filling, queues stabilizing).
- **Handler**: our declarative description of what a server does with a request (compute, call cache, on miss call DB...).
