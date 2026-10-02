import React, { useState } from "react";
import type { Connection } from "../../../lib/router/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { ProviderIcon } from "../ui/ProviderIcon";

interface ModelsTableProps {
  connections: Connection[];
}

export function ModelsTable({ connections }: ModelsTableProps) {
  const [search, setSearch] = useState("");
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

  const filtered = allModels.filter((m) =>
    `${m.id} ${m.name} ${m.provider} ${m.connectionLabel}`
      .toLowerCase()
      .includes(search.toLowerCase()),
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

      {!!allModels.length && (
        <label className="ui-field">
          Search models
          <input
            type="search"
            placeholder="Model, provider or account…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      {!!allModels.length && !filtered.length && (
        <EmptyState
          title="No matching models"
          description="Try a different model ID, provider, or account name."
          action={
            <button className="ui-button" onClick={() => setSearch("")}>
              Clear search
            </button>
          }
        />
      )}
      {!allModels.length ? (
        <EmptyState
          title="No models discovered"
          description="Test a configured connection to query its model catalog API, then select a default chat model."
        />
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table
              className="ui-data-table w-full text-left text-xs"
              aria-label="Discovered models"
            >
              <thead className="bg-surface-2/60 border-b border-border-subtle text-text-muted font-medium">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Model ID</th>
                  <th className="py-2.5 px-4 font-medium">
                    Account / Provider
                  </th>
                  <th className="py-2.5 px-4 font-medium">Source / Status</th>
                  <th className="py-2.5 px-4 font-medium">Context Window</th>
                  <th className="py-2.5 px-4 font-medium">USD / 1M Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((m) => (
                  <tr
                    key={`${m.connectionId}-${m.id}`}
                    className="hover:bg-surface-2/40 transition-colors"
                  >
                    <td
                      data-label="Model"
                      className="py-3 px-4 font-mono text-xs"
                    >
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

                    <td data-label="Account / Provider" className="py-3 px-4">
                      <div className="text-text-main font-medium">
                        {m.connectionLabel}
                      </div>
                      <div className="text-[11px] text-text-subtle font-mono flex items-center gap-1.5 mt-0.5">
                        <ProviderIcon
                          providerId={m.provider}
                          size={14}
                          className="max-w-[14px] max-h-[14px]"
                          fallbackText={m.provider.slice(0, 2)}
                        />
                        <span>{m.provider}</span>
                      </div>
                    </td>

                    <td data-label="Source / Status" className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={m.connectionEnabled ? "success" : "default"}
                          size="sm"
                        >
                          {m.connectionEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <span className="text-text-muted text-[11px]">
                          {m.source}
                        </span>
                      </div>
                    </td>

                    <td
                      data-label="Context window"
                      className="py-3 px-4 font-mono text-[11px] text-text-muted"
                    >
                      {m.contextWindow
                        ? m.contextWindow.toLocaleString()
                        : "Unknown"}
                    </td>

                    <td
                      data-label="USD / 1M tokens"
                      className="py-3 px-4 font-mono text-[11px] text-text-muted"
                    >
                      {m.inputPrice === undefined
                        ? "Unknown"
                        : `${(m.inputPrice * 1_000_000).toLocaleString()} in / ${m.outputPrice === undefined ? "Unknown" : (m.outputPrice * 1_000_000).toLocaleString()} out`}
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
