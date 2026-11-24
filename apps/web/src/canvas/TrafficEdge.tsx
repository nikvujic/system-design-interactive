import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getStraightPath } from "@xyflow/react";
import { useEdgeMetrics, usePlaying } from "./live-store";
import type { CanvasEdge } from "./to-flow";
import "./traffic-edge.css";

/** Below this many requests per second a connection counts as idle. */
const IDLE_RATE = 0.5;

/** Requests per second as a short label, e.g. `850/s` or `1.2k/s`. */
export function rateLabel(requestsPerSecond: number): string {
  if (requestsPerSecond >= 1000) return `${(requestsPerSecond / 1000).toFixed(1)}k/s`;
  return `${Math.round(requestsPerSecond)}/s`;
}

/**
 * A connection that shows whether traffic flows on it: a plain line when idle, moving dashes while
 * requests travel it (paused with the simulation). The label in the middle carries the numbers.
 */
export function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: EdgeProps<CanvasEdge>) {
  const traffic = useEdgeMetrics(data?.index ?? -1);
  const playing = usePlaying();
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const rate = traffic?.requestsPerSecond ?? 0;
  const flowing = rate >= IDLE_RATE;
  const rejectedShare = flowing ? (traffic?.rejectedPerSecond ?? 0) / rate : 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={flowing ? `traffic-flowing${playing ? "" : " traffic-paused"}` : undefined}
      />
      {flowing && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 10,
              padding: "1px 4px",
              borderRadius: 4,
              background: "rgba(255, 255, 255, 0.9)",
              color: "#374151",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {rateLabel(rate)}
            {rejectedShare >= 0.005 && ` · ${Math.round(rejectedShare * 100)}% rejected`}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
