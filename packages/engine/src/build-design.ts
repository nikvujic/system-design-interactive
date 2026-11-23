import type { Design, ServiceTimeSpec } from "@sdi/schema";
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
): BuiltDesign {
  const targetsOf = (id: string) => design.edges.filter((e) => e.from === id).map((e) => e.to);
  // Receivers are looked up when a request is delivered, so nodes can be built in any order.
  const receivers = new Map<string, Receiver>();
  const deliver = (id: string, request: SimRequest) => receivers.get(id)!(request);
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
          onClientResult,
        );
        servers.set(node.id, server);
        receivers.set(node.id, (request) => server.receive(request));
        break;
      }
      case "load_balancer": {
        const targets = targetsOf(node.id);
        let next = 0;
        receivers.set(node.id, (request) => {
          const target = targets[next]!;
          next = (next + 1) % targets.length;
          deliver(target, request);
        });
        break;
      }
      case "clients": {
        const target = targetsOf(node.id)[0]!;
        const source = startPoissonSource(
          sim,
          createStream(seed, node.id),
          node.requestsPerSecond,
          (request) => deliver(target, request),
        );
        sources.set(node.id, source);
        break;
      }
    }
  }
  return { servers, sources };
}
