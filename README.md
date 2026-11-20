# System Design Interactive

A LeetCode-style platform for **system design**. Instead of writing code, users place infrastructure blocks
(load balancers, servers, caches, databases, queues, CDNs...), configure them, and run a **realistic traffic
simulation** to see whether the design meets its targets: latency, error rate, availability, and cost.

> Status: pre-development. This repository currently contains planning documents only.

## Planning documents

Read them in this order:

| # | Document | What it covers |
|---|----------|----------------|
| 1 | [Product vision](docs/01-product-vision.md) | What we're building, for whom, what is in scope and what is out |
| 2 | [Simulation engine](docs/02-simulation-engine.md) | **The core of the product.** How we model real systems faithfully |
| 3 | [Component catalog](docs/03-component-catalog.md) | Every block, its configuration, its behavior, realistic default numbers |
| 4 | [Technical architecture](docs/04-technical-architecture.md) | React/Node stack, monorepo layout, rendering, data flow |
| 5 | [Problems & grading](docs/05-problems-and-grading.md) | Problem format, how solutions are judged, content strategy |
| 6 | [UX & visualization](docs/06-ux-and-visualization.md) | Editor, request "dots", dashboards, the learning loop |
| 7 | [Roadmap](docs/07-roadmap.md) | Phased delivery plan with exit criteria |
| 8 | [Open design questions](docs/08-decisions-needed.md) | Decisions to resolve as implementation proceeds |
| 9 | [Glossary](docs/09-glossary.md) | System design concepts explained, as a reference while reading |

The [Glossary](docs/09-glossary.md) defines the system design terms used throughout these documents.
