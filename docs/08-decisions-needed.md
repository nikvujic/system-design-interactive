# 8. Open Design Questions

This document tracks project-level questions that affect implementation. Record resolved decisions in
architecture decision records under `docs/adr/` when the repository is ready for them.

## Current project direction

- The project is an exploratory prototype for interactive system design simulations. Productization may be
  considered as the project develops; current plans do not assume a commercial launch.
- The project is named System Design Interactive. Internal packages use the `@sdi/` scope.
- The initial build does not require account creation. Designs can be stored locally and exported.
- The product should teach through realistic, observable outcomes while clearly communicating the limits
  of its simulation model.
- Content should be original. Research may inform topic selection, but published text, diagrams, and
  solutions should not be copied.

## Questions to resolve before or during implementation

### Product and content

- Which problem should be the first end-to-end example, and what behavior should it demonstrate?
- Which simulation results must be visible in the initial prototype for its core idea to be understandable?

### Simulation

- Should the initial engine use discrete-event simulation as proposed in [Simulation Engine](02-simulation-engine.md),
  and what validation results are required before building the editor?
- What event-volume and wall-clock performance targets are appropriate for the first engine benchmark?
- Which service-time distributions and component capacity values need sourced calibration before they appear
  as representative defaults?
- What is the minimum server resource model for the first simulation: CPU, concurrency, bounded queues, or
  some subset?
- Must results be bit-identical across browsers, or only on the same JavaScript engine? Cross-engine
  determinism would require engine-independent `log` and `exp` implementations (see
  [Simulation Engine §2.2](02-simulation-engine.md)). This matters most if server-side grading is added.

### Implementation

- Which API style is appropriate if a backend becomes necessary: REST with OpenAPI or tRPC?
- Which routing library should the web application use?
- Which persistence and hosting choices should be revisited if the prototype grows beyond local use?

These questions do not all block the initial engine spike. Resolve only the choices needed to keep each
implementation phase coherent, and update this document as answers become clear.
