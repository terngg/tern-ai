"use client";
import { useEffect, useState } from "react";
import { providers, virtualModels } from "../../../lib/router/registry";
import { canonicalSelection } from "../../../lib/router/model-selection";
import type { Connection, PoolConfig } from "../../../lib/router/types";
import { connectionStatus } from "../providers/RouterDashboard";
import { Select, type SelectOption } from "../ui/Select";
const effortName = (effort: string) =>
  ({
    none: "None",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
    max: "Max",
    ultra: "Ultra",
  })[effort] || effort;
interface Snapshot {
  connections: Connection[];
  pools: PoolConfig[];
}
async function api(path: string): Promise<Snapshot> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Connections unavailable");
  return response.json();
}
export function RouterSelector({
  model,
  pool,
  provider,
  onChange,
}: {
  model: string;
  pool: string;
  provider: string;
  onChange: (model: string, pool: string, provider: string) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      void api("/api/router")
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoaded(true));
    };
    load();
    // Companion discovery changes independently of provider edits. Refresh while visible.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    window.addEventListener("tern-router-changed", load);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("tern-router-changed", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const selectedPool = data?.pools.find((p) => p.id === pool && p.enabled);
  const accounts = (data?.connections || []).filter(
    (c) => c.enabled && (!pool || selectedPool?.connections.includes(c.id)),
  );
  const catalog = accounts.map((c) => ({
    connection: c,
    models: [
      ...new Map<
        string,
        {
          id: string;
          name: string;
          reasoningEfforts?: string[];
          defaultReasoningEffort?: string;
        }
      >([
        ...(c.model
          ? [[c.model, { id: c.model, name: c.model }] as const]
          : []),
        ...c.models.map((m) => [m.id, m] as const),
      ]).values(),
    ],
  }));
  const automatic = virtualModels.includes(model);
  const selectedModel = canonicalSelection(model, accounts);
  const modelAvailable =
    automatic ||
    catalog.some(({ connection, models }) =>
      models.some(
        (m) =>
          `${connection.id}::${m.id}` === selectedModel ||
          (connection.provider === "codex" &&
            m.reasoningEfforts?.some(
              (effort) =>
                `${connection.id}::${m.id}::${effort}` === selectedModel,
            )),
      ),
    );
  const providerIds = [
    ...new Set(accounts.filter((c) => c.model).map((c) => c.provider)),
  ];
  const providerName = (id: string) =>
    providers.find((p) => p.id === id)?.name || id;
  const modes: Record<string, string> = {
    auto: "Automatic · Balanced",
    "auto/balanced": "Automatic · Balanced",
    "auto/fast": "Fastest measured",
    "auto/cheap": "Lowest known cost",
    "auto/quality": "Account priority",
  };

  const modelOptions: SelectOption[] = [
    ...virtualModels.map((value) => ({
      value,
      label: modes[value] || value,
      group: "Automatic routing",
      description: value,
    })),
    ...(!modelAvailable
      ? [{ value: model, label: "Selected model unavailable", disabled: true }]
      : []),
    ...catalog.flatMap(({ connection: c, models }) =>
      models.flatMap((m) => {
        const base = {
          value: `${c.id}::${m.id}`,
          label:
            c.provider === "codex" && m.defaultReasoningEffort
              ? `${m.name} · Default (${effortName(m.defaultReasoningEffort)})`
              : m.name,
          group: `${providerName(c.provider)} · ${c.label}`,
          groupStatus: connectionStatus(c),
          description: m.id,
          keywords: c.provider,
          badges: [
            c.models.find((model) => model.id === m.id)?.source || "configured",
          ],
        };
        return [
          base,
          ...(c.provider === "codex" ? m.reasoningEfforts || [] : []).map(
            (effort) => ({
              ...base,
              value: `${c.id}::${m.id}::${effort}`,
              label: `${m.name} · ${effortName(effort)}`,
              description: `${m.id} · Reasoning: ${effortName(effort)}`,
              badges: [...base.badges, "reasoning"],
            }),
          ),
        ];
      }),
    ),
  ];
  return (
    <section className="chat-routing" aria-label="Chat routing">
      <div className="chat-routing-controls">
        <div className="ui-field">
          <span>Model</span>
          <Select
            label="Routing model"
            title="Select model"
            value={selectedModel}
            onChange={(value) => onChange(value, pool, provider)}
            options={modelOptions}
            searchable
            searchPlaceholder="Search models…"
          />
        </div>
        <div className="ui-field">
          <span>Try provider first</span>
          <Select
            label="Preferred provider"
            title="Choose preferred provider"
            value={automatic ? provider : ""}
            disabled={!automatic}
            onChange={(value) => onChange(model, pool, value)}
            options={[
              {
                value: "",
                label: automatic
                  ? "Automatic order"
                  : "Fixed by selected model",
              },
              ...(provider && !providerIds.includes(provider)
                ? [
                    {
                      value: provider,
                      label: "Selected provider unavailable",
                      disabled: true,
                    },
                  ]
                : []),
              ...providerIds.map((id) => ({
                value: id,
                label: providerName(id),
              })),
            ]}
          />
        </div>
        <div className="ui-field">
          <span>Account pool</span>
          <Select
            label="Routing pool"
            title="Choose account pool"
            value={pool}
            onChange={(value) => onChange("auto", value, "")}
            options={[
              { value: "", label: "All my accounts" },
              ...(pool && !selectedPool
                ? [
                    {
                      value: pool,
                      label: "Selected pool unavailable",
                      disabled: true,
                    },
                  ]
                : []),
              ...(data?.pools
                .filter((p) => p.enabled)
                .map((p) => ({ value: p.id, label: p.name })) || []),
            ]}
          />
        </div>
      </div>
      <p className="chat-routing-hint">
        {!loaded
          ? "Loading your connections…"
          : !data
            ? "Sign in in Providers to choose your connected models."
            : !accounts.length
              ? "Add an enabled connection in Providers to choose a model."
              : !automatic
                ? `Uses this exact model and account.${selectedModel.split("::")[2] ? ` Reasoning: ${effortName(selectedModel.split("::")[2]!)}; higher effort may use more quota.` : ""} Select Auto to allow provider fallback.`
                : provider
                  ? `${providerName(provider)} is tried first when eligible, then other accounts in this pool. Uses each account’s default model.`
                  : "Auto uses each account’s default model and the selected routing strategy."}
      </p>
    </section>
  );
}
