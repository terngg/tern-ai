import React, { useState } from "react";
import type { Connection, Trace } from "../../../lib/router/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { ProviderIcon } from "../ui/ProviderIcon";

interface RequestsTableProps {
  traces: Trace[];
  connections: Connection[];
}

const errorLabels: Record<string, string> = {
  unknown: "Unknown",
  connected: "Connected",
  healthy: "Healthy",
  auth_failure: "Auth failed",
  permission_denied: "Permission denied",
  rate_limit: "Rate limit (429)",
  quota_exhausted: "Quota exhausted",
  timeout: "Timeout",
  stream_interrupted: "Stream interrupted",
  provider_overload: "Provider overloaded",
  server_error: "Provider error",
  network: "Network error",
  bad_request: "Request rejected",
  cancelled: "Cancelled",
};

export function RequestsTable({ traces, connections }: RequestsTableProps) {
  const [filter, setFilter] = useState<"all" | "ok" | "error">("all");

  const filtered = traces.filter((t) => {
    if (filter === "ok") return t.status === "ok";
    if (filter === "error") return t.status !== "ok";
    return true;
  });

  return (
    <div className="space-y-4">
      {traces.length > 0 && (
        <div className="ui-table-toolbar flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-lg border border-border-subtle bg-surface">
            {(
              [
                ["all", "All Requests"],
                ["ok", "Successful"],
                ["error", "Errors"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filter === key
                    ? "bg-surface-2 text-text-main font-semibold shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs text-text-muted">
            Showing {filtered.length} of {traces.length}
          </span>
        </div>
      )}

      {!!traces.length && !filtered.length && (
        <EmptyState
          title="No matching requests"
          description="No requests match this status filter."
          action={
            <button className="ui-button" onClick={() => setFilter("all")}>
              Show all requests
            </button>
          }
        />
      )}
      {!traces.length ? (
        <EmptyState
          title="No requests recorded"
          description="Run a chat through a configured connection to inspect route execution, latency, and tokens."
        />
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table
              className="ui-data-table w-full text-left text-xs"
              aria-label="Request history"
            >
              <thead className="bg-surface-2/60 border-b border-border-subtle text-text-muted font-medium">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Time / ID</th>
                  <th className="py-2.5 px-4 font-medium">Route</th>
                  <th className="py-2.5 px-4 font-medium">Result</th>
                  <th className="py-2.5 px-4 font-medium">Latency / TTFT</th>
                  <th className="py-2.5 px-4 font-medium">Tokens / Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((t) => {
                  const isOk = t.status === "ok";
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-surface-2/40 transition-colors"
                    >
                      <td
                        data-label="Time / ID"
                        className="py-3 px-4 font-mono text-[11px] whitespace-nowrap"
                      >
                        <div className="text-text-main">
                          {new Date(t.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                        <div className="text-text-subtle text-[10px]">
                          {t.id.slice(0, 8)}
                        </div>
                      </td>

                      <td data-label="Route" className="py-3 px-4">
                        <div className="font-semibold text-text-main flex items-center gap-1.5">
                          <ProviderIcon
                            providerId={t.provider}
                            size={14}
                            className="max-w-[14px] max-h-[14px]"
                            fallbackText={t.provider.slice(0, 2)}
                          />
                          <span>
                            {t.provider} / {t.selectedModel}
                          </span>
                        </div>
                        <div className="text-text-muted text-[11px]">
                          Requested: {t.requestedModel} · {t.retries} retries
                          {t.preferredProvider &&
                            ` · First choice: ${t.preferredProvider}`}
                        </div>
                        {t.fallbackPath.length > 0 && (
                          <details className="mt-1 text-[10px] text-text-subtle cursor-pointer">
                            <summary>
                              {t.fallbackPath.length} fallback step(s)
                            </summary>
                            <div className="mt-1 pl-2 border-l border-border-subtle space-y-0.5">
                              {t.fallbackPath.map((id) => (
                                <div key={id}>
                                  {connections.find((c) => c.id === id)
                                    ?.label || id}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>

                      <td data-label="Result" className="py-3 px-4">
                        <Badge
                          variant={isOk ? "success" : "error"}
                          size="sm"
                          dot
                        >
                          {isOk
                            ? "Completed"
                            : errorLabels[t.errorCategory || "unknown"]}
                        </Badge>
                      </td>

                      <td
                        data-label="Latency / TTFT"
                        className="py-3 px-4 font-mono text-[11px] whitespace-nowrap"
                      >
                        <span className="text-text-main">{t.latencyMs} ms</span>
                        <div className="text-text-subtle text-[10px]">
                          TTFT:{" "}
                          {t.ttftMs === null ? "Unknown" : `${t.ttftMs} ms`}
                        </div>
                      </td>

                      <td
                        data-label="Tokens / Cost"
                        className="py-3 px-4 font-mono text-[11px] whitespace-nowrap"
                      >
                        <span className="text-text-main">
                          {t.inputTokens ?? "?"} / {t.outputTokens ?? "?"}
                        </span>
                        <div className="text-text-subtle text-[10px]">
                          {t.estimatedCost === null
                            ? "Cost unknown"
                            : `$${t.estimatedCost.toFixed(6)}`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
