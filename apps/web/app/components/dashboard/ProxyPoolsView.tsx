import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Connection, PoolConfig } from "../../../lib/router/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

interface ProxyPoolsViewProps {
  pools: PoolConfig[];
  connections: Connection[];
  busy: boolean;
  onAct: (body: unknown) => Promise<boolean>;
}

export function ProxyPoolsView({
  pools,
  connections,
  busy,
  onAct,
}: ProxyPoolsViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-border-subtle bg-surface text-xs text-text-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-main">
            Failover & Proxy Pools
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Pools route requests through your configured accounts with
            deterministic fallback ordering.
          </p>
        </div>
      </div>

      {/* Create Pool Card */}
      <PoolEditor
        connections={connections}
        disabled={busy || !connections.length}
        save={onAct}
      />

      {/* Pool List */}
      <div className="space-y-4">
        {pools.map((p) => {
          const isEditing = editingId === p.id;
          return (
            <article
              key={p.id}
              className="router-panel p-5 rounded-xl border border-border-subtle bg-surface space-y-4 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-text-main">
                    {p.name}
                  </h3>
                  <Badge
                    variant={p.enabled ? "success" : "default"}
                    size="sm"
                    dot
                  >
                    {p.enabled ? "Enabled" : "Disabled"} ·{" "}
                    {p.strategy.replaceAll("_", " ")}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void onAct({
                        action: "savePool",
                        ...p,
                        enabled: !p.enabled,
                      })
                    }
                  >
                    {p.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => setEditingId(isEditing ? null : p.id)}
                  >
                    {isEditing ? "Close" : "Edit"}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="danger"
                    disabled={busy}
                    icon={<Trash2 size={12} />}
                    onClick={() => void onAct({ action: "deletePool", id: p.id })}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {/* Fallback Connection Chain */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Fallback Route Chain ({p.connections.length})
                </span>
                <ol className="divide-y divide-border-subtle/50 rounded-lg border border-border-subtle bg-surface-2/30">
                  {p.connections.map((id, index) => {
                    const conn = connections.find((c) => c.id === id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-text-subtle text-[11px] w-4">
                            {index + 1}.
                          </span>
                          <span className="font-medium text-text-main">
                            {conn?.label || "Removed connection"}
                          </span>
                          {conn && (
                            <span className="text-text-muted text-[11px]">
                              ({conn.provider})
                            </span>
                          )}
                        </div>
                        {conn?.model && (
                          <span className="font-mono text-[11px] text-text-subtle">
                            {conn.model}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>

              {isEditing && (
                <div className="pt-3 border-t border-border-subtle">
                  <PoolEditor
                    connections={connections}
                    initial={p}
                    disabled={busy}
                    save={async (body) => {
                      const ok = await onAct(body);
                      if (ok) setEditingId(null);
                      return ok;
                    }}
                  />
                </div>
              )}
            </article>
          );
        })}

        {!pools.length && (
          <EmptyState
            title="No pools configured"
            description="Create a proxy pool to configure multi-account rotation and prioritized fallback."
          />
        )}
      </div>
    </div>
  );
}

function PoolEditor({
  connections,
  initial,
  disabled,
  save,
}: {
  connections: Connection[];
  initial?: PoolConfig;
  disabled: boolean;
  save: (body: unknown) => Promise<boolean>;
}) {
  return (
    <form
      className="p-5 rounded-xl border border-border-subtle bg-surface space-y-4 shadow-sm text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const d = new FormData(form);
        if (
          await save({
            action: "savePool",
            id: initial?.id,
            name: d.get("name"),
            strategy: d.get("strategy"),
            connections: String(d.get("connections") || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            enabled: initial?.enabled ?? true,
          })
        ) {
          if (!initial) form.reset();
        }
      }}
    >
      <div className="flex items-center gap-1.5 font-semibold text-text-main text-sm pb-1 border-b border-border-subtle">
        <Plus size={14} className="text-primary" />
        {initial ? "Edit pool" : "Create new proxy pool"}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-text-muted">
          Pool Name
          <input
            name="name"
            required
            defaultValue={initial?.name}
            placeholder="e.g. Primary Production Pool"
            className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-text-muted">
          Selection Strategy
          <select
            name="strategy"
            defaultValue={initial?.strategy || "priority"}
            className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
          >
            {[
              "priority",
              "round_robin",
              "least_recently_used",
              "health_aware",
            ].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-text-muted">
        Connection IDs in fallback order (one per line)
        <textarea
          name="connections"
          required
          rows={3}
          defaultValue={initial?.connections.join("\n")}
          placeholder="Paste connection IDs here"
          className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary font-mono"
        />
      </label>

      {connections.length > 0 && (
        <details className="text-[11px] text-text-subtle cursor-pointer">
          <summary>Available connection IDs ({connections.length})</summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded-lg bg-surface-2/40 border border-border-subtle/50">
            {connections.map((c) => (
              <div key={c.id} className="p-1.5 rounded bg-bg font-mono">
                <div className="text-text-main font-sans font-medium">
                  {c.label} ({c.provider})
                </div>
                <code className="text-[10px] text-text-muted">{c.id}</code>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || !connections.length}
        >
          {initial ? "Update pool" : "Save pool"}
        </Button>
      </div>
    </form>
  );
}
