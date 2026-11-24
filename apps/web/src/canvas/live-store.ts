import type { LiveEdgeMetrics, LiveMetrics, LiveNodeMetrics } from "@sdi/engine";
import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Holds the latest live metrics outside React state. Components that show live numbers subscribe
 * to just their part (one node, one connection), so a metrics update re-renders those components
 * only, never the canvas or React Flow's node list.
 */
export class LiveStore {
  private metrics: LiveMetrics | undefined;
  private playing = false;
  private readonly listeners = new Set<() => void>();

  set(metrics: LiveMetrics | undefined, playing: boolean): void {
    this.metrics = metrics;
    this.playing = playing;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  node(id: string): LiveNodeMetrics | undefined {
    return this.metrics?.nodes.find((node) => node.id === id);
  }

  edge(index: number): LiveEdgeMetrics | undefined {
    return this.metrics?.edges[index];
  }

  isPlaying(): boolean {
    return this.playing;
  }
}

export const LiveStoreContext = createContext<LiveStore | undefined>(undefined);

function useStore(): LiveStore {
  const store = useContext(LiveStoreContext);
  if (!store) throw new Error("Live metrics are only available inside <LiveStoreContext>");
  return store;
}

/** The latest metrics of one node; re-renders only when they change. */
export function useNodeMetrics(id: string): LiveNodeMetrics | undefined {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.node(id));
}

/** The latest traffic on one connection (its index in `design.edges`). */
export function useEdgeMetrics(index: number): LiveEdgeMetrics | undefined {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.edge(index));
}

export function usePlaying(): boolean {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.isPlaying());
}
