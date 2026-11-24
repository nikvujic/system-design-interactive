# ADR 0002: Traffic shown on connections, not as particles

**Status:** Accepted

## Context

The planned visualization drew request "particles" (dots) on a single canvas over the React Flow editor:
each sampled request travelled its path and came back colored by outcome. Two variants were built and
tried in the sandbox:

1. **Request tracking:** sampled requests from the engine animated hop by hop, out and back, colored by
   outcome.
2. **Flow dots:** evenly spaced dots on each connection, with spacing derived from the connection's traffic
   and a share drawn as failures.

Both had the same problems:

- **Alignment.** The canvas computed line positions separately from React Flow, so dots drifted off
  diagonal connections by a few pixels.
- **Smoothness.** Per-frame JavaScript animation stuttered whenever the main thread was busy, for example
  while React Flow re-measured nodes.
- **Readability.** At high traffic or simulation speed, request tracking produced a dense swarm that was
  harder to read than the numbers it represented.

A third variant, two lanes of moving dashes per connection with failures drawn in red, was also tried and
rejected: thick dashes and overlaid failure dashes made the canvas visually noisy.

## Decision

- A connection with traffic is drawn as a thin, neutral, animated dashed line (the React Flow animated-edge
  style). An idle connection is a plain line. The dashes stop while the simulation is paused.
- The amount of traffic and its failures are shown as numbers in a label on the connection
  (requests per second, rejected share), not as visual density or color. The visual treatment of traffic
  state in labels and node boxes is an open design question.
- The animation is CSS, run by the browser, inside a custom React Flow edge, so it always follows the
  edge's own path.
- Nodes and edges are built once from the design. Live numbers reach each node and connection through a
  store they subscribe to, so a metrics update re-renders only those components, never the canvas.

## Consequences

- The canvas does not show individual requests or their outcomes. Failures are visible in labels and node
  boxes only.
- The engine still supports sampling individual requests as particles (off by default). It is kept for a
  later "follow one request" view with traces, which may use a canvas overlay.
- Animation cost does not grow with traffic or simulation speed.
