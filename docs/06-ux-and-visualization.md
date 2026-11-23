# 6. UX & Visualization

## 6.1 Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Problem: "One Server Isn't Enough"     ▶ Run  ⏸  ⏩ 1× ▾  ⟲ Reset   Submit  │
├────────────┬──────────────────────────────────────────────┬──────────────────┤
│ Components │                                              │  Inspector       │
│ ──────────  │      [Users 2000rps] ──●●●──► [LB] ─●●─► [S1] │  (selected node) │
│  ▢ Server  │                               └──●●─► [S2] │  Tier: Medium ▾  │
│  ▢ LB      │                                              │  vCPU 4  Mem 8GB │
│  ▢ Cache   │          canvas (pan/zoom, minimap)          │  Threads 200     │
│  ▢ DB      │                                              │  ── live ──      │
│  🔒 Queue  │                                              │  CPU  ▇▇▇▇▆ 71%  │
│            │                                              │  Queue 12        │
├────────────┴──────────────────────────────────────────────┴──────────────────┤
│ Metrics:  p50 42ms  p99 180ms  ✓   errors 0.02% ✓   throughput 1,998/s   $310/mo ✓ │
│ [ latency chart ][ throughput/errors chart ][ per-node utilization ]  [Traces] [Events] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Left panel collapses to a story/problem tab in Problem mode.

## 6.2 Visual language on the canvas

| Signal | Encoding |
|---|---|
| Request flow | Dots on edges. Density ∝ log(throughput). Speed ∝ (scaled) link latency. |
| Request outcome | Dot color: neutral/blue = in flight, green = success returning, amber = slow (> SLO), red = error/timeout, purple = retry |
| Node load | Node border/fill heat from utilization: calm → amber at 70% → red at 90%+ |
| Queue build-up | Dots visibly stacking at the node's input port, plus a small queue bar on the node |
| Node down | Greyed out, broken-link icon, edges dashed |
| Bottleneck | Pulsing outline on the node the bottleneck detector flags |
| Cache | Hit/miss split: hits return early (green short loop), misses continue to DB |
| Live badge | Small per-node text: `1.2k/s · p99 45ms` (updated ~4 Hz, not every frame) |

**Accessibility:** color is never the only signal. Errors also use shape (× marks), and status uses icons.
Provide a color-blind-safe palette.

## 6.3 Time controls

- Play / pause / step (advance 100 ms of sim time).
- Speed: 0.1×, 0.5×, 1×, 5×, 20×, Max (no animation, compute as fast as possible, then show results).
- **Timeline scrubber** showing scenario events (spike at 30s, failure at 60s) as markers.
- **Traffic control during a run:** change a clients node's request rate while the simulation runs and
  watch queues, latency and errors respond. Runs continue until stopped, and metrics cover the last few
  seconds of simulated time.
- **Live editing during a run** (Sandbox): change replicas or cache size mid-run and watch the system react.
  It's a strong learning experience ("I added a server and the queue drained"). The engine supports
  reconfiguration as a scheduled event, so it stays deterministic and replayable.

## 6.4 Metrics panel

- Headline SLO tiles with pass/fail against problem targets.
- Charts (uPlot), sim time on the x-axis, scenario events as vertical markers:
  - Latency p50/p95/p99 over time
  - Throughput vs errors (stacked by error type: timeout, rejected, 5xx)
  - Utilization per node (small multiples)
  - Queue depth per node
  - Cost rate
- **Click a node → its own dashboard** (like a Grafana panel for that service).
- **Traces tab:** list of sampled requests (slowest first, failed first). Click → waterfall view showing
  time spent per hop (queueing vs compute vs network). This answers *"where did the 900 ms go?"*

## 6.5 Editor interactions (pro-tool expectations)

- Drag from palette, connect by dragging handles, multi-select, copy/paste, align/snap to grid.
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z) for everything.
- Keyboard shortcuts and a command palette (Ctrl+K: "add cache", "run", "set replicas 3").
- Region/AZ **group boxes**: drag nodes into a region and latency updates.
- Inline validation: red marker on misconfigured nodes with fix suggestions.
- Autosave to local storage, with design export/import.
- **Pattern presets** when connecting nodes (e.g. Server→Cache prompts "Cache-aside / Write-through").

## 6.6 Onboarding: the first 3 minutes

1. Landing → "Try it now" without an account (problem 1 runs fully client-side).
2. Problem 1 opens already running: dots flowing, the server turning red, error counter climbing.
   **The user sees failure before reading anything.**
3. A coach mark points to the palette: "Drag a Load Balancer here."
4. They add an LB and a second server, press run, everything turns green → success screen with the concept explanation.
5. Offer to save the design locally or export it.

## 6.7 Learning layer

- **Learn cards:** short (≤ 200 words), concept explanations with an embedded mini-simulation where
  possible. Linked from components, failures and hints.
- **Contextual explanations for every choice:** components, settings and pattern presets (e.g. Cache-aside)
  each carry a short inline explanation with expandable detail: what it is, how requests flow, and what it changes.
- **Guidance levels:** explanation content is stored as data, separate from UI components, and rendered
  according to a guidance level (full / minimal / off). Problems can set the level, so a future challenge mode
  can hide help without changes to the editor.
- **Explain this number:** hover any metric ("p99") → tooltip definition plus a link to the glossary.
- **Post-solve debrief:** what you did, what the reference did, the trade-offs, the real-world examples.
- **"What would break next?"** after solving: a teaser for the next problem. ("Your design handles 2k
  RPS. At 20k, the DB will be the problem.")

## 6.8 Visual design direction

Calm, technical, high-contrast dark theme by default (light theme available). Think Linear/Vercel
dashboard rather than a game. Icons: neutral, vendor-agnostic shapes (no AWS icon set: licensing,
plus we're vendor-neutral). Motion is purposeful: particles and heat, no decorative animation.
