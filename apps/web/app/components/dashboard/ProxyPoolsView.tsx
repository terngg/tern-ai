import React, { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { Connection, PoolConfig } from "../../../lib/router/types";
import { Select } from "../ui/Select";
import { Form } from "../ui/Form";
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
                    onClick={() =>
                      void onAct({ action: "deletePool", id: p.id })
                    }
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
  const [selected, setSelected] = useState<string[]>(
    initial?.connections || [],
  );
  const move = (index: number, delta: number) =>
    setSelected((current) => {
      const next = [...current];
      [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
      return next;
    });
  return (
    <Form
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
          if (!initial) {
            form.reset();
            setSelected([]);
          }
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
          <Select
            label="Selection strategy"
            name="strategy"
            defaultValue={initial?.strategy || "priority"}
            options={[
              "priority",
              "round_robin",
              "least_recently_used",
              "health_aware",
            ].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
          />
        </label>
      </div>

      <div className="ui-field">
        <span>Accounts in fallback order</span>
        <input type="hidden" name="connections" value={selected.join("\n")} />
        <Select
          label="Add pool account"
          title="Add an account"
          value=""
          disabled={disabled}
          searchable
          options={[
            { value: "", label: "Choose an account to add", disabled: true },
            ...connections
              .filter((c) => !selected.includes(c.id))
              .map((c) => ({
                value: c.id,
                label: c.label,
                description: `${c.provider} · ${c.model || "No default model"}`,
              })),
          ]}
          onChange={(id) => {
            if (id) setSelected((current) => [...current, id]);
          }}
        />
        <ol className="ui-pool-accounts">
          {selected.map((id, index) => {
            const account = connections.find((c) => c.id === id);
            return (
              <li key={id}>
                <span className="ui-pool-position">{index + 1}</span>
                <div>
                  <strong>{account?.label || "Removed connection"}</strong>
                  <small>{account?.provider || id}</small>
                </div>
                <button
                  type="button"
                  className="ui-icon-button"
                  aria-label={`Move ${account?.label || "account"} up`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="ui-icon-button"
                  aria-label={`Move ${account?.label || "account"} down`}
                  disabled={disabled || index === selected.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="ui-icon-button"
                  aria-label={`Remove ${account?.label || "account"} from draft pool`}
                  disabled={disabled}
                  onClick={() =>
                    setSelected((current) =>
                      current.filter((value) => value !== id),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ol>
        {!selected.length && (
          <small>
            Add at least one account. Requests follow the selected strategy and
            fallback order.
          </small>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || !selected.length}
        >
          {initial ? "Update pool" : "Save pool"}
        </Button>
      </div>
    </Form>
  );
}
