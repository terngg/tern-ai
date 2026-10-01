import React from "react";
import type { Connection } from "../../../lib/router/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";

interface ModelsTableProps {
  connections: Connection[];
}

export function ModelsTable({ connections }: ModelsTableProps) {
  const allModels = connections.flatMap((c) =>
    c.models.map((m) => ({
      ...m,
      connectionId: c.id,
      connectionLabel: c.label,
      provider: c.provider,
      connectionEnabled: c.enabled,
      isSelected: m.id === c.model,
    })),
  );

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border-subtle bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-main">
            Discovered Models Catalog
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Models retrieved from live provider catalog APIs via connection
            testing.
          </p>
        </div>
        {allModels.length > 0 && (
          <span className="text-xs text-text-muted">
            {allModels.length} discovered models
          </span>
        )}
      </div>

      {!allModels.length ? (
        <EmptyState
          title="No models discovered"
          description="Test a configured connection to query its model catalog API, then select a default chat model."
        />
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2/60 border-b border-border-subtle text-text-muted font-medium">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Model ID</th>
                  <th className="py-2.5 px-4 font-medium">Account / Provider</th>
                  <th className="py-2.5 px-4 font-medium">Source / Status</th>
                  <th className="py-2.5 px-4 font-medium">Context Window</th>
                  <th className="py-2.5 px-4 font-medium">USD / 1M Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {allModels.map((m) => (
                  <tr
                    key={`${m.connectionId}-${m.id}`}
                    className="hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-main">
                          {m.id}
                        </span>
                        {m.isSelected && (
                          <Badge variant="primary" size="sm">
                            selected
                          </Badge>
                        )}
                      </div>
                      {m.name && m.name !== m.id && (
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {m.name}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-text-main font-medium">
                        {m.connectionLabel}
                      </div>
                      <div className="text-[11px] text-text-subtle font-mono">
                        {m.provider}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={m.connectionEnabled ? "success" : "default"}
                          size="sm"
                        >
                          {m.connectionEnabled ? "Active" : "Disabled"}
                        </Badge>
                        <span className="text-text-muted text-[11px]">
                          {m.source}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-text-muted">
                      {m.contextWindow ? m.contextWindow.toLocaleString() : "Unknown"}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-text-muted">
                      {m.inputPrice === undefined
                        ? "Unknown"
                        : `${m.inputPrice} in / ${m.outputPrice ?? "Unknown"} out`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
