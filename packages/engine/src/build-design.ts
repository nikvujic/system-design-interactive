import type { Design, ServiceTimeSpec } from "@sdi/schema";
import type { ParticleSampler } from "./particles";
import { createStream } from "./random";
import { type Outcome, Server, type SimRequest } from "./server";
import {
  constantServiceTime,
  exponentialServiceTime,
  lognormalServiceTime,
  type ServiceTime,
} from "./service-time";
import type { Simulation } from "./simulation";
import { type PoissonSource, startPoissonSource } from "./source";
import { ms } from "./time";

/** The running pieces of a design, by node id. */
export interface BuiltDesign {
  servers: Map<string, Server>;
  sources: Map<string, PoissonSource>;
}

type Receiver = (request: SimRequest) => void;

function toServiceTime(spec: ServiceTimeSpec): ServiceTime {
  switch (spec.kind) {
    case "constant":
      return constantServiceTime(ms(spec.ms));
    case "exponential":
      return exponentialServiceTime(ms(spec.meanMs));
    case "lognormal":
      return lognormalServiceTime(ms(spec.medianMs), ms(spec.p99Ms));
  }
}

/** Optional observers of what happens inside a built design. */
export interface BuildObservers {
  /** Sampled requests also report their hops and outcomes for animation. */
  particles?: ParticleSampler;
  /** Called for every request that travels a connection, with the connection's index in `design.edges`. */
  onHop?: (request: SimRequest, edgeIndex: number) => void;
}

/**
 * Creates the nodes of a validated design inside `sim` and starts its traffic.
 * The design must come from `parseDesign`; graph rules (no loops, valid connections) are assumed.
 * `onClientResult` is called once per request, when it completes or is rejected.
 */
export function buildDesign(
  sim: Simulation,
  design: Design,
  seed: number,
  onClientResult: (request: SimRequest, outcome: Outcome) => void,
  { particles, onHop }: BuildObservers = {},
): BuiltDesign {
  /** Indexes in `design.edges` of the connections leaving `id`, in order. */
  const edgesFrom = (id: string) => design.edges.flatMap((edge, index) => (edge.from === id ? [index] : []));
  // Receivers are looked up when a request is delivered, so nodes can be built in any order.
  const receivers = new Map<string, Receiver>();
  const deliver = (edgeIndex: number, request: SimRequest) => {
    const edge = design.edges[edgeIndex]!;
    particles?.hop(request, edge.from, edge.to, sim.now);
    onHop?.(request, edgeIndex);
    receivers.get(edge.to)!(request);
  };
  const servers = new Map<string, Server>();
  const sources = new Map<string, PoissonSource>();

  for (const node of design.nodes) {
    switch (node.type) {
      case "server": {
        const server = new Server(
          sim,
          {
            cores: node.cores,
            queueCapacity: node.queueCapacity,
            serviceTime: toServiceTime(node.serviceTime),
          },
          createStream(seed, node.id),
          (request, outcome) => {
            particles?.done(request, node.id, outcome, sim.now);
            onClientResult(request, outcome);
          },
        );
        servers.set(node.id, server);
        receivers.set(node.id, (request) => server.receive(request));
        break;
      }
      case "load_balancer": {
        const outgoing = edgesFrom(node.id);
        let next = 0;
        receivers.set(node.id, (request) => {
          const edgeIndex = outgoing[next]!;
          next = (next + 1) % outgoing.length;
          deliver(edgeIndex, request);
        });
        break;
      }
      case "clients": {
        const edgeIndex = edgesFrom(node.id)[0]!;
        const source = startPoissonSource(
          sim,
          createStream(seed, node.id),
          node.requestsPerSecond,
          (request) => {
            particles?.sample(request, source.ratePerSecond);
            deliver(edgeIndex, request);
          },
        );
        sources.set(node.id, source);
        break;
      }
    }
  }
  return { servers, sources };
}
