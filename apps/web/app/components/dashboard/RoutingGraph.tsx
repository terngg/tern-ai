import React, { useState } from "react";
import type { Connection, PoolConfig } from "../../../lib/router/types";
import { connectionStatus } from "../providers/RouterDashboard";
import { Select } from "../ui/Select";
import { EmptyState } from "../ui/EmptyState";
import { getProviderColor } from "./providerColors";

interface RoutingGraphProps {
  connections: Connection[];
  pools: PoolConfig[];
}

export function RoutingGraph({ connections, pools }: RoutingGraphProps) {
  const [pool, setPool] = useState("");
  const config = pools.find((p) => p.id === pool);
  const nodes = config
    ? config.connections
        .map((id) => connections.find((c) => c.id === id))
        .filter((c): c is Connection => Boolean(c))
    : connections;

  const height = Math.max(280, nodes.length * 90 + 60);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border-subtle bg-surface">
        <div>
          <h3 className="text-sm font-semibold text-text-main">
            Configured Topology
          </h3>
          <p className="text-xs text-text-muted">
            Configured routing pipeline and account fallback
          </p>
        </div>
        <Select
          label="Topology pool"
          value={pool}
          onChange={setPool}
          options={[
            { value: "", label: "All accounts" },
            ...pools.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </div>

      {!nodes.length ? (
        <EmptyState
          title="No configured routes"
          description="Add your first provider connection to inspect the live routing topology."
        />
      ) : (
        <div className="router-graph p-4 rounded-xl border border-border-subtle bg-surface/50 overflow-x-auto">
          <svg
            viewBox={`0 0 920 ${height}`}
            className="w-full min-w-[700px] h-auto"
            role="img"
            aria-label="Configured account routing topology"
          >
            <defs>
              <marker
                id="route-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M0 1 L7 4 L0 7" fill="var(--accent)" />
              </marker>
            </defs>

            {/* Chat Input Node */}
            <g>
              <rect
                x="20"
                y={height / 2 - 26}
                width="140"
                height="52"
                rx="10"
                fill="var(--panel)"
                stroke="var(--line)"
                strokeWidth="1.5"
              />
              <text
                x="90"
                y={height / 2 - 2}
                textAnchor="middle"
                fill="var(--text)"
                fontSize="12"
                fontWeight="600"
                fontFamily="system-ui"
              >
                Your Chat
              </text>
              <text
                x="90"
                y={height / 2 + 14}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="10"
                fontFamily="system-ui"
              >
                Tern AI Web
              </text>
            </g>

            {/* Connector to Router */}
            <path
              d={`M160 ${height / 2} H270`}
              stroke="var(--accent)"
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#route-arrow)"
            />

            {/* Router Node */}
            <g>
              <rect
                x="270"
                y={height / 2 - 32}
                width="170"
                height="64"
                rx="12"
                fill="#2a2220"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
              <text
                x="355"
                y={height / 2 - 6}
                textAnchor="middle"
                fill="var(--accent)"
                fontSize="13"
                fontWeight="700"
                fontFamily="system-ui"
              >
                Tern Router
              </text>
              <text
                x="355"
                y={height / 2 + 12}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="10"
                fontFamily="system-ui"
              >
                Policy & Health Routing
              </text>
            </g>

            {/* Nodes and Edges to connections */}
            {nodes.map((c, i) => {
              const y = 50 + i * 90;
              const status = connectionStatus(c);
              const isDisabled = !c.enabled || (config && !config.enabled);
              const isCooling = c.cooldownUntil && c.cooldownUntil > Date.now();
              const brandColor = getProviderColor(c.provider);

              const edgeColor = isDisabled
                ? "#444444"
                : isCooling
                  ? "#F59E0B"
                  : "var(--accent)";

              return (
                <g key={c.id} opacity={isDisabled ? 0.45 : 1}>
                  {/* Bezier connector */}
                  <path
                    d={`M440 ${height / 2} C510 ${height / 2} 490 ${y} 570 ${y}`}
                    stroke={edgeColor}
                    strokeWidth="1.5"
                    strokeDasharray={isDisabled ? "4 4" : "none"}
                    fill="none"
                    markerEnd="url(#route-arrow)"
                  />

                  {/* Destination Card */}
                  <rect
                    x="570"
                    y={y - 28}
                    width="330"
                    height="56"
                    rx="10"
                    fill="var(--panel)"
                    stroke="var(--line)"
                    strokeWidth="1.2"
                  />

                  {/* Color bar */}
                  <rect
                    x="570"
                    y={y - 28}
                    width="4"
                    height="56"
                    rx="2"
                    fill={brandColor}
                  />

                  {/* Provider & Label */}
                  <text
                    x="588"
                    y={y - 6}
                    fill="var(--text)"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="system-ui"
                  >
                    {c.provider} / {c.label.slice(0, 26)}
                  </text>

                  {/* Model & Status */}
                  <text
                    x="588"
                    y={y + 14}
                    fill="var(--muted)"
                    fontSize="10"
                    fontFamily="system-ui"
                  >
                    {c.model || "Model not selected"} · {status}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
