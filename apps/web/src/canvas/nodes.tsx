import { Handle, type NodeProps, type NodeTypes, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import type { CanvasNode } from "./to-flow";

type Props = NodeProps<CanvasNode>;

/** How loaded a server is. Shown as a border color and always also as text, never color alone. */
export function heat(utilization: number | undefined): "idle" | "ok" | "busy" | "saturated" {
  if (utilization === undefined) return "idle";
  if (utilization >= 0.9) return "saturated";
  if (utilization >= 0.7) return "busy";
  return "ok";
}

const HEAT_COLOR = { idle: "#9ca3af", ok: "#16a34a", busy: "#d97706", saturated: "#dc2626" };

const perSecond = (value: number) => `${Math.round(value).toLocaleString("en-US")}/s`;

function Box(props: {
  title: string;
  kind: string;
  border?: string;
  children?: ReactNode;
  inputs?: boolean;
  outputs?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 170,
        padding: "8px 12px",
        borderRadius: 8,
        background: "white",
        border: `2px solid ${props.border ?? HEAT_COLOR.idle}`,
        fontSize: 12,
      }}
    >
      {props.inputs && <Handle type="target" position={Position.Left} isConnectable={false} />}
      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#6b7280" }}>{props.kind}</div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{props.title}</div>
      {props.children && <div style={{ marginTop: 4, color: "#374151" }}>{props.children}</div>}
      {props.outputs && <Handle type="source" position={Position.Right} isConnectable={false} />}
    </div>
  );
}

function ClientsNode({ data }: Props) {
  if (data.node.type !== "clients") return null;
  const rate = data.metrics?.requestsPerSecond ?? data.node.requestsPerSecond;
  return (
    <Box title={data.node.id} kind="Clients" outputs>
      sending {perSecond(rate)}
    </Box>
  );
}

function LoadBalancerNode({ data }: Props) {
  if (data.node.type !== "load_balancer") return null;
  return (
    <Box title={data.node.id} kind="Load balancer" inputs outputs>
      {data.node.algorithm.replace("_", " ")}
    </Box>
  );
}

function ServerNode({ data }: Props) {
  if (data.node.type !== "server") return null;
  const m = data.metrics;
  const level = heat(m?.utilization);
  return (
    <Box title={data.node.id} kind={`Server · ${data.node.cores} cores`} border={HEAT_COLOR[level]} inputs>
      {m?.utilization === undefined ? (
        "not running"
      ) : (
        <>
          <div>
            {Math.round(m.utilization * 100)}% busy{level === "saturated" ? " (saturated)" : ""}
          </div>
          <div>
            {perSecond(m.completedPerSecond ?? 0)} served
            {(m.rejectedPerSecond ?? 0) > 0 && <> · {perSecond(m.rejectedPerSecond ?? 0)} rejected</>}
          </div>
          <div>
            queue {m.queueLength ?? 0} / {data.node.queueCapacity}
          </div>
        </>
      )}
    </Box>
  );
}

/** One component per design node type. React Flow picks the component by the node's `type`. */
export const nodeTypes = {
  clients: ClientsNode,
  load_balancer: LoadBalancerNode,
  server: ServerNode,
} satisfies NodeTypes;
