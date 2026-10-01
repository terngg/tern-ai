"use client";
import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { providers, virtualModels } from "../../../lib/router/registry";
import type {
  Connection,
  PoolConfig,
  ProviderDefinition,
  Trace,
} from "../../../lib/router/types";
import { ProviderCard } from "../dashboard/ProviderCard";
import { ProviderDrawer } from "../dashboard/ProviderDrawer";
import { RoutingGraph } from "../dashboard/RoutingGraph";
import { RequestsTable } from "../dashboard/RequestsTable";
import { UsageView } from "../dashboard/UsageView";
import { QuotaView } from "../dashboard/QuotaView";
import { ProxyPoolsView } from "../dashboard/ProxyPoolsView";
import { ModelsTable } from "../dashboard/ModelsTable";
import { Button } from "../ui/Button";

export type RouterScreen =
  | "providers"
  | "pools"
  | "routing"
  | "models"
  | "usage"
  | "quota"
  | "requests"
  | "settings";

interface Snapshot {
  user: { id: string; email: string };
  connections: Connection[];
  pools: PoolConfig[];
  traces: Trace[];
}

export const labels: Record<string, string> = {
  unknown: "Unknown",
  connected: "Connected",
  healthy: "Healthy",
  auth_failure: "Authentication failed",
  permission_denied: "Permission denied",
  rate_limit: "Rate limited",
  quota_exhausted: "Quota exhausted",
  timeout: "Timeout",
  stream_interrupted: "Stream interrupted",
  provider_overload: "Provider overloaded",
  server_error: "Provider error",
  network: "Network error",
  bad_request: "Request rejected",
  cancelled: "Cancelled",
};

export function connectionStatus(c: Connection): string {
  if (!c.enabled) return "Disabled";
  if (c.cooldownUntil && c.cooldownUntil > Date.now()) return "Cooldown";
  if (
    c.checkedAt &&
    Date.now() - c.checkedAt > 15 * 60_000 &&
    ["healthy", "connected"].includes(c.health)
  )
    return "Unknown · check expired";
  return labels[c.health] || "Unknown";
}

async function api(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function RouterDashboard({
  screen = "providers",
}: {
  screen?: RouterScreen;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<ProviderDefinition | null>(null);
  const [register, setRegister] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSnapshot(await api("/api/router"));
      setNotice("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Router unavailable.");
      setSnapshot(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (body: unknown): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await api("/api/router", body);
      await reload();
      if (result.results) {
        const failures = result.results.filter(
          (r: { ok: boolean }) => !r.ok,
        ).length;
        setNotice(
          `${result.results.length} configured connections checked; ${failures} failed or cooling down.`,
        );
      }
      window.dispatchEvent(new Event("tern-router-changed"));
      return true;
    } catch (e) {
      await reload();
      setNotice(e instanceof Error ? e.message : "Operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const connections = snapshot?.connections || [];
  const pools = snapshot?.pools || [];
  const traces = snapshot?.traces || [];

  const title = {
    providers: "Providers",
    pools: "Proxy Pools",
    routing: "Routing",
    models: "Models",
    usage: "Usage",
    quota: "Quota",
    requests: "Requests",
    settings: "Account & Settings",
  }[screen];

  return (
    <section className="providers-container real-router max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* 9Router Header */}
      <header className="providers-header flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div className="providers-header-left">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            TERN AI / ROUTER
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-text-main tracking-tight mt-0.5">
            {title}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {screen === "providers"
              ? "Manage your AI provider connections"
              : "Your connections, routing configuration, and measured activity."}
          </p>
        </div>

        <div className="router-actions flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />}
            onClick={() => void reload()}
          >
            Refresh
          </Button>

          {screen === "providers" && (
            <Button
              variant="primary"
              size="sm"
              disabled={
                !snapshot || busy || !connections.some((c) => c.enabled)
              }
              icon={<Activity size={13} />}
              onClick={() => void act({ action: "testAll" })}
            >
              {busy ? "Testing…" : "Test All"}
            </Button>
          )}
        </div>
      </header>

      {notice && (
        <div
          className="router-notice p-3 rounded-lg border border-primary/20 bg-primary/10 text-primary text-xs flex items-center justify-between"
          role="status"
        >
          <span>{notice}</span>
          <button
            type="button"
            className="text-primary hover:underline text-[11px] ml-2"
            onClick={() => setNotice("")}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Auth panel when not signed in */}
      {!snapshot && loaded && (
        <form
          className="router-auth max-w-md mx-auto p-6 rounded-xl border border-border-subtle bg-surface space-y-4 shadow-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            setBusy(true);
            try {
              await api("/api/auth", {
                action: register ? "register" : "login",
                email: data.get("email"),
                password: data.get("password"),
              });
              form.reset();
              await reload();
              window.dispatchEvent(new Event("tern-router-changed"));
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : "Sign-in failed.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="text-center space-y-1">
            <div className="size-10 mx-auto rounded-full bg-surface-2 flex items-center justify-center text-primary mb-2">
              <ShieldCheck size={20} />
            </div>
            <h2 className="text-base font-semibold text-text-main">
              {register ? "Create your Tern account" : "Sign in to Tern AI"}
            </h2>
            <p className="text-xs text-text-muted">
              Provider credentials are encrypted and private to your account.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="px-3 py-2 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={12}
              maxLength={256}
              required
              className="px-3 py-2 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
            />
          </label>

          <div className="space-y-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              disabled={busy}
            >
              {register ? "Create account" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setRegister(!register)}
            >
              {register ? "Use existing account" : "Create account"}
            </Button>
          </div>
        </form>
      )}

      {/* Screen: Providers */}
      {screen === "providers" && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="router-summary flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border-subtle bg-surface text-xs text-text-muted">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-text-main">
                Routing Status
              </span>
              <span className="text-text-subtle font-mono">
                {connections.length} connection{connections.length === 1 ? "" : "s"} configured
              </span>
            </div>
            <span>
              {pools.filter((p) => p.enabled).length} failover pool{pools.filter((p) => p.enabled).length === 1 ? "" : "s"} active
            </span>
          </div>

          {/* Search and Category Filters */}
          <div className="router-toolbar flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="router-search relative flex-1 max-w-sm">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
              />
              <input
                aria-label="Search providers"
                placeholder="Search providers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-text-main text-xs outline-none focus:border-primary placeholder:text-text-muted"
              />
            </div>

            <div className="router-filters flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                ["all", "All Providers"],
                ["api_key", "API Keys"],
                ["oauth", "OAuth / CLI"],
                ["free", "Free"],
                ["compatible", "Compatible"],
                ["configured", "Configured"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    category === id
                      ? "bg-surface-2 text-text-main font-semibold shadow-sm border border-border-subtle"
                      : "text-text-muted hover:text-text-main hover:bg-surface-2/50"
                  }`}
                  onClick={() => setCategory(id!)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider Groups */}
          {(["oauth", "free", "api_key", "compatible", "local"] as const).map(
            (group) => {
              const items = providers.filter(
                (p) =>
                  p.category === group &&
                  (category === "all" ||
                    category === group ||
                    (category === "configured" &&
                      connections.some((c) => c.provider === p.id))) &&
                  p.name.toLowerCase().includes(search.toLowerCase()),
              );

              if (items.length === 0) return null;

              const groupLabels = {
                oauth: "OAuth Providers",
                free: "Free Providers",
                api_key: "API Key Providers",
                compatible: "Compatible Providers",
                local: "Local Providers",
              };

              return (
                <section
                  className="router-group space-y-3"
                  id={"section-" + group}
                  key={group}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-text-main flex items-center gap-2">
                      {groupLabels[group]}
                      <span className="text-xs text-text-muted font-normal">
                        ({items.length})
                      </span>
                    </h2>
                  </div>

                  <div className="router-card-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map((p) => (
                      <ProviderCard
                        key={p.id}
                        provider={p}
                        connections={connections}
                        onClick={() => setSelected(p)}
                        onToggle={async (enabled) => {
                          const accounts = connections.filter(
                            (c) => c.provider === p.id,
                          );
                          for (const c of accounts) {
                            await act({
                              action: "update",
                              id: c.id,
                              enabled,
                            });
                          }
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            },
          )}
        </div>
      )}

      {/* Screen: Pools */}
      {screen === "pools" && (
        <ProxyPoolsView
          pools={pools}
          connections={connections}
          busy={busy}
          onAct={act}
        />
      )}

      {/* Screen: Routing */}
      {screen === "routing" && (
        <div className="space-y-6">
          <div className="router-panel p-5 rounded-xl border border-border-subtle bg-surface space-y-2">
            <h2 className="text-sm font-semibold text-text-main">
              Routing Policy & Engine
            </h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Auto / Balanced rotates eligible accounts. Fast prefers healthy
              accounts and measured latency. Quality uses your priority order.
              Cheap requires recent, provider-reported prices. Fallback is
              limited to four accounts and stops after partial output.
            </p>
            <p className="text-xs text-text-subtle">
              Unconfigured models, disabled accounts, authentication failures,
              exhausted quota and active cooldowns are excluded from candidate
              selection.
            </p>
          </div>

          <RoutingGraph connections={connections} pools={pools} />
        </div>
      )}

      {/* Screen: Models */}
      {screen === "models" && <ModelsTable connections={connections} />}

      {/* Screen: Usage */}
      {screen === "usage" && (
        <UsageView traces={traces} connections={connections} />
      )}

      {/* Screen: Quota */}
      {screen === "quota" && <QuotaView connections={connections} />}

      {/* Screen: Requests */}
      {screen === "requests" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border-subtle bg-surface">
            <h3 className="text-sm font-semibold text-text-main">
              Request Inspector
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Inspect actual routes, retries, latency, TTFT, and token usage from
              AI inference invocations.
            </p>
          </div>
          <RequestsTable traces={traces} connections={connections} />
        </div>
      )}

      {/* Screen: Settings */}
      {screen === "settings" && snapshot && (
        <article className="router-panel p-6 rounded-xl border border-border-subtle bg-surface space-y-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Signed in account
            </span>
            <h2 className="text-base font-semibold text-text-main">
              {snapshot.user.email}
            </h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Your credentials are encrypted on the server. Chat history and
              attachments remain on this browser. Signing out prevents access to
              stored provider connections; it does not erase browser chat
              history.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await api("/api/auth", undefined, "DELETE");
              await reload();
              window.dispatchEvent(new Event("tern-router-changed"));
            }}
          >
            Sign out
          </Button>
        </article>
      )}

      {/* Provider Details Drawer */}
      <ProviderDrawer
        provider={selected}
        connections={connections}
        busy={busy}
        signedIn={Boolean(snapshot)}
        onClose={() => setSelected(null)}
        onAct={act}
      />
    </section>
  );
}

export function RouterSelector({
  model,
  pool,
  onChange,
}: {
  model: string;
  pool: string;
  onChange: (model: string, pool: string) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null);

  useEffect(() => {
    const load = () => {
      void api("/api/router")
        .then(setData)
        .catch(() => setData(null));
    };
    load();
    window.addEventListener("tern-router-changed", load);
    return () => window.removeEventListener("tern-router-changed", load);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <label className="provider-pill">
        <select
          aria-label="Routing model"
          value={model}
          onChange={(e) => onChange(e.target.value, pool)}
          className="h-8 px-2.5 rounded-lg border border-border-subtle bg-surface text-text-main text-xs outline-none focus:border-primary cursor-pointer"
        >
          {virtualModels.map((m) => (
            <option value={m} key={m}>
              {m}
            </option>
          ))}
          {data?.connections
            .filter((c) => c.enabled && c.model)
            .map((c) => (
              <option key={c.id} value={c.id + "::" + c.model}>
                {c.label} / {c.model}
              </option>
            ))}
        </select>
      </label>

      <select
        className="router-pool-select h-8 px-2 rounded-lg border border-border-subtle bg-surface text-text-main text-xs outline-none focus:border-primary cursor-pointer"
        aria-label="Routing pool"
        value={pool}
        onChange={(e) => onChange(model, e.target.value)}
      >
        <option value="">All my accounts</option>
        {data?.pools
          .filter((p) => p.enabled)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    </div>
  );
}
