"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Cable,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { providers, virtualModels } from "../../../lib/router/registry";
import type {
  Connection,
  PoolConfig,
  ProviderDefinition,
  Trace,
} from "../../../lib/router/types";
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
const labels: Record<string, string> = {
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
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [selected, setSelected] = useState<ProviderDefinition | null>(null),
    [register, setRegister] = useState(false);
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
  const act = async (body: unknown) => {
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
  const connections = snapshot?.connections || [],
    pools = snapshot?.pools || [],
    traces = snapshot?.traces || [];
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
    <section className="providers-container real-router">
      <header className="providers-header">
        <div className="providers-header-left">
          <span className="eyebrow">TERN AI / ROUTER</span>
          <h1>{title}</h1>
          <p>
            {screen === "providers"
              ? "Manage your AI provider connections"
              : "Your connections, routing configuration, and measured activity."}
          </p>
        </div>
        <div className="router-actions">
          <button
            className="secondary-btn"
            disabled={busy}
            onClick={() => void reload()}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {screen === "providers" && (
            <button
              className="primary-btn"
              disabled={
                !snapshot || busy || !connections.some((c) => c.enabled)
              }
              onClick={() => void act({ action: "testAll" })}
            >
              <Activity size={14} />
              {busy ? "Testing…" : "Test All"}
            </button>
          )}
        </div>
      </header>
      {notice && (
        <div className="router-notice" role="status">
          {notice}
        </div>
      )}
      {!snapshot && loaded && (
        <form
          className="router-auth"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = new FormData(form);
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
          <div>
            <ShieldCheck size={22} />
            <strong>
              {register ? "Create your Tern account" : "Sign in to Tern AI"}
            </strong>
            <p>
              Provider credentials are encrypted and private to your account.
            </p>
          </div>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={12}
              maxLength={256}
              required
            />
          </label>
          <button className="primary-btn" disabled={busy}>
            {register ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setRegister(!register)}
          >
            {register ? "Use existing account" : "Create account"}
          </button>
        </form>
      )}
      {screen === "providers" && (
        <>
          <div className="router-summary">
            <div>
              <Cable size={24} />
              <div>
                <strong>Tern routing gateway</strong>
                <p>GTPS context → account selection → AI → Lua validation</p>
              </div>
            </div>
            <span>
              {connections.length} connections ·{" "}
              {pools.filter((p) => p.enabled).length} enabled pools
            </span>
          </div>
          <div className="router-toolbar">
            <div className="router-search">
              <Search size={16} />
              <input
                aria-label="Search providers"
                placeholder="Search providers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="router-filters">
              {[
                ["all", "All providers"],
                ["api_key", "API keys"],
                ["oauth", "OAuth / CLI"],
                ["free", "Account"],
                ["compatible", "Compatible"],
                ["configured", "Configured"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={category === id ? "active" : ""}
                  onClick={() => setCategory(id!)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
              return (
                items.length > 0 && (
                  <section
                    className="router-group"
                    id={"section-" + group}
                    key={group}
                  >
                    <h2>
                      {
                        {
                          oauth: "OAuth / CLI Providers",
                          free: "Free / Account Providers",
                          api_key: "API Key Providers",
                          compatible: "Compatible Providers",
                          local: "Local Providers",
                        }[group]
                      }{" "}
                      <span>{items.length}</span>
                    </h2>
                    <div className="router-card-grid">
                      {items.map((p) => {
                        const accounts = connections.filter(
                          (c) => c.provider === p.id,
                        );
                        return (
                          <button
                            className="provider-card real-provider-card"
                            key={p.id}
                            onClick={() => setSelected(p)}
                          >
                            <div className="router-card-top">
                              <span
                                className={"router-provider-icon icon-" + p.id}
                              >
                                {p.name.slice(0, 2)}
                              </span>
                              <strong>{p.name}</strong>
                              <span className="router-card-arrow">↗</span>
                            </div>
                            <div className="router-card-status">
                              {p.adapterStatus === "requires_companion"
                                ? "Requires Tern Companion"
                                : p.adapterStatus === "unsupported"
                                  ? "Unsupported"
                                  : accounts.length
                                    ? `${accounts.length} connection${accounts.length === 1 ? "" : "s"}`
                                    : "Not configured"}
                            </div>
                            <div className="router-card-bottom">
                              <span>
                                {p.adapterStatus === "implemented"
                                  ? "Chat · Code · Streaming"
                                  : p.auth === "local_companion"
                                    ? "Local integration"
                                    : "No request mapping"}
                              </span>
                              {accounts.length > 0 && (
                                <span>
                                  {accounts.length === 1
                                    ? connectionStatus(accounts[0]!)
                                    : `${accounts.filter((c) => ["Connected", "Healthy"].includes(connectionStatus(c))).length} checked`}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )
              );
            },
          )}
        </>
      )}
      {screen === "pools" && (
        <>
          <p className="router-help">
            Pools route through your configured accounts. Priority preserves the
            listed fallback order. They do not create network proxy servers.
          </p>
          <PoolEditor
            connections={connections}
            disabled={!snapshot || busy}
            save={act}
          />
          <div className="router-list">
            {pools.map((p) => (
              <article className="router-panel" key={p.id}>
                <div className="router-row">
                  <h2>{p.name}</h2>
                  <span>
                    {p.enabled ? "Enabled" : "Disabled"} ·{" "}
                    {p.strategy.replaceAll("_", " ")}
                  </span>
                  <button
                    className="secondary-btn"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "savePool",
                        ...p,
                        enabled: !p.enabled,
                      })
                    }
                  >
                    {p.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="secondary-btn"
                    disabled={busy}
                    onClick={() => void act({ action: "deletePool", id: p.id })}
                  >
                    Delete
                  </button>
                </div>
                <ol>
                  {p.connections.map((id) => (
                    <li key={id}>
                      {connections.find((c) => c.id === id)?.label ||
                        "Removed connection"}
                    </li>
                  ))}
                </ol>
                <details>
                  <summary>Edit pool</summary>
                  <PoolEditor
                    connections={connections}
                    initial={p}
                    disabled={busy}
                    save={act}
                  />
                </details>
              </article>
            ))}
          </div>
          {!pools.length && (
            <Empty text="No pools configured. Create a pool to define account selection and fallback order." />
          )}
        </>
      )}
      {screen === "routing" && (
        <>
          <div className="router-panel">
            <h2>Routing policy</h2>
            <p>
              Auto / Balanced rotates eligible accounts. Fast prefers healthy
              accounts and measured latency. Quality uses your priority order.
              Cheap requires recent, provider-reported prices. Fallback is
              limited to four accounts and stops after partial output.
            </p>
            <p>
              Choose a pool and virtual model in the chat toolbar. Unconfigured
              models, disabled accounts, authentication failures, exhausted
              quota and active cooldowns are excluded.
            </p>
          </div>
          <Topology connections={connections} pools={pools} />
        </>
      )}
      {screen === "models" && (
        <div className="router-table-wrap">
          <table className="router-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider / account</th>
                <th>Source / availability</th>
                <th>Context</th>
                <th>Input / output USD per token</th>
              </tr>
            </thead>
            <tbody>
              {connections.flatMap((c) =>
                c.models.map((m) => (
                  <tr key={c.id + m.id}>
                    <td>
                      {m.id}
                      {m.id === c.model ? " · selected" : ""}
                    </td>
                    <td>
                      {c.provider} / {c.label}
                    </td>
                    <td>
                      {m.source} · {c.enabled ? "Enabled" : "Disabled"}
                    </td>
                    <td>{m.contextWindow ?? "Unknown"}</td>
                    <td>
                      {m.inputPrice === undefined
                        ? "Unknown"
                        : `${m.inputPrice} / ${m.outputPrice ?? "Unknown"}`}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {!connections.some((c) => c.models.length) && (
            <Empty text="No models discovered. Test a configured connection to load its catalog, then select a chat model." />
          )}
        </div>
      )}
      {screen === "quota" && (
        <div className="router-card-grid">
          {connections.map((c) => (
            <article className="router-panel" key={c.id}>
              <h2>{c.label}</h2>
              <p>{c.provider}</p>
              <strong>
                {c.quota === "exhausted" ? "Quota exhausted" : "Unknown"}
              </strong>
              <p>No remaining percentage is available from this integration.</p>
              {c.cooldownUntil && c.cooldownUntil > Date.now() && (
                <p>
                  Cooldown until {new Date(c.cooldownUntil).toLocaleString()}
                </p>
              )}
            </article>
          ))}
          {!connections.length && (
            <Empty text="No configured accounts. Quota will remain unknown unless the provider supplies evidence." />
          )}
        </div>
      )}
      {screen === "usage" && (
        <>
          <div className="router-summary">
            <div>
              <strong>{traces.length} recorded attempts</strong>
              <p>Latest 200 attempts, including validation repair calls</p>
            </div>
            <span>
              {traces.filter((t) => t.status === "ok").length} successful ·{" "}
              {traces.filter((t) => t.status === "error").length} failed
            </span>
          </div>
          <div className="router-panel">
            <h2>Reported token usage</h2>
            <p>
              {traces
                .filter((t) => t.inputTokens !== null)
                .reduce((n, t) => n + (t.inputTokens || 0), 0)
                .toLocaleString()}{" "}
              input ·{" "}
              {traces
                .filter((t) => t.outputTokens !== null)
                .reduce((n, t) => n + (t.outputTokens || 0), 0)
                .toLocaleString()}{" "}
              output
            </p>
            <p>
              {
                traces.filter(
                  (t) => t.inputTokens === null || t.outputTokens === null,
                ).length
              }{" "}
              attempts have missing token data. Unknown usage is not counted as
              zero cost.
            </p>
          </div>
        </>
      )}
      {(screen === "requests" || screen === "usage") && (
        <div className="router-table-wrap">
          <table className="router-table">
            <thead>
              <tr>
                <th>Time / request</th>
                <th>Route</th>
                <th>Result</th>
                <th>Latency / TTFT</th>
                <th>Tokens / cost</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr key={t.id}>
                  <td>
                    {new Date(t.timestamp).toLocaleString()}
                    <small>{t.id}</small>
                  </td>
                  <td>
                    {t.provider} / {t.selectedModel}
                    <small>
                      {t.requestedModel} · {t.retries} retries
                    </small>
                    <details>
                      <summary>Fallback path</summary>
                      {t.fallbackPath.map((id) => (
                        <div key={id}>
                          {connections.find((c) => c.id === id)?.label || id}
                        </div>
                      ))}
                    </details>
                  </td>
                  <td>
                    {t.status === "ok"
                      ? "Completed"
                      : labels[t.errorCategory || "unknown"]}
                  </td>
                  <td>
                    {t.latencyMs} ms /{" "}
                    {t.ttftMs === null ? "Unknown" : `${t.ttftMs} ms`}
                  </td>
                  <td>
                    {t.inputTokens ?? "?"} / {t.outputTokens ?? "?"}
                    <small>
                      {t.estimatedCost === null
                        ? "Cost unknown"
                        : `$${t.estimatedCost.toFixed(6)}`}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!traces.length && (
            <Empty text="No requests recorded. Run a chat through a configured connection to see its route and timing." />
          )}
        </div>
      )}
      {screen === "settings" && snapshot && (
        <article className="router-panel">
          <h2>{snapshot.user.email}</h2>
          <p>
            Your credentials are encrypted on the server. Chat history and
            attachments remain on this browser. Signing out prevents access to
            stored provider connections; it does not erase browser chat history.
          </p>
          <button
            className="secondary-btn"
            onClick={async () => {
              await api("/api/auth", undefined, "DELETE");
              await reload();
              window.dispatchEvent(new Event("tern-router-changed"));
            }}
          >
            Sign out
          </button>
        </article>
      )}
      {selected && (
        <div className="router-overlay" onClick={() => setSelected(null)}>
          <aside
            className="router-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">PROVIDER CONNECTIONS</span>
                <h2>{selected.name}</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Close provider"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </header>
            {notice && (
              <div className="router-notice" role="alert">
                {notice}
              </div>
            )}
            {selected.adapterStatus !== "implemented" ? (
              <div className="router-panel">
                <Server />
                <h3>
                  {selected.adapterStatus === "requires_companion"
                    ? "Requires Tern Companion"
                    : "Unsupported"}
                </h3>
                <p>
                  {selected.adapterStatus === "requires_companion"
                    ? "This integration requires a local client or desktop session. A Tern Companion connection is not available yet."
                    : "Custom REST requires an explicit request and response mapping. No adapter is available yet."}
                </p>
              </div>
            ) : (
              <>
                <p className="router-help">
                  Saving a key creates an untested connection. Test discovers
                  models; a successful chat establishes inference health.
                </p>
                {selected.docs && (
                  <a href={selected.docs} target="_blank" rel="noreferrer">
                    Provider API documentation ↗
                  </a>
                )}
                {connections
                  .filter((c) => c.provider === selected.id)
                  .map((c) => (
                    <ConnectionEditor
                      key={c.id}
                      connection={c}
                      busy={busy}
                      act={act}
                    />
                  ))}
                {snapshot ? (
                  <ConnectionForm provider={selected} busy={busy} save={act} />
                ) : (
                  <p>Sign in before adding a connection.</p>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="router-empty">
      <Cable size={28} />
      <p>{text}</p>
    </div>
  );
}
function ConnectionForm({
  provider,
  busy,
  save,
}: {
  provider: ProviderDefinition;
  busy: boolean;
  save: (body: unknown) => Promise<boolean>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="router-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          d = new FormData(form);
        let headers: unknown = {};
        try {
          headers = JSON.parse(String(d.get("headers") || "{}"));
        } catch {
          form
            .querySelector<HTMLTextAreaElement>("[name=headers]")
            ?.setCustomValidity("Enter valid JSON.");
          return;
        }
        const body = {
          action: "create",
          provider: provider.id,
          label: d.get("label"),
          key: d.get("key"),
          model: d.get("model"),
          baseUrl: d.get("baseUrl"),
          authHeader: d.get("authHeader"),
          authPrefix: d.get("authPrefix"),
          headers,
          models: String(d.get("models") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          timeoutMs: Number(d.get("timeout") || 60000),
          enabled: d.get("enabled") === "on",
        };
        const key = form.querySelector<HTMLInputElement>("[name=key]");
        if (key) key.value = "";
        const custom =
          form.querySelector<HTMLTextAreaElement>("[name=headers]");
        if (custom) custom.value = "";
        if (await save(body)) form.reset();
      }}
    >
      <h3>
        <Plus size={16} /> Add connection
      </h3>
      <label>
        Connection name
        <input
          name="label"
          required
          maxLength={80}
          placeholder="Personal, Work, Backup…"
        />
      </label>
      <label>
        API key
        <input
          name="key"
          type="password"
          autoComplete="off"
          required
          minLength={8}
          maxLength={4096}
        />
      </label>
      <label>
        Default chat model
        <input
          name="model"
          placeholder="Select after discovery, or enter a model ID"
          maxLength={200}
        />
      </label>
      {provider.category === "compatible" && (
        <>
          <label>
            API base URL
            <input
              name="baseUrl"
              type="url"
              required
              placeholder="https://api.example.com/v1"
            />
          </label>
          <div className="router-two-col">
            <label>
              Auth header
              <input
                name="authHeader"
                defaultValue={
                  provider.protocol === "anthropic"
                    ? "x-api-key"
                    : "Authorization"
                }
              />
            </label>
            <label>
              Auth prefix
              <input
                name="authPrefix"
                defaultValue={
                  provider.protocol === "anthropic" ? "" : "Bearer "
                }
              />
            </label>
          </div>
          <label>
            Custom headers (encrypted JSON)
            <textarea
              name="headers"
              onChange={(e) => e.target.setCustomValidity("")}
              placeholder='{"X-Account": "value"}'
            />
          </label>
          <label>
            Model IDs (comma-separated)
            <input name="models" />
          </label>
        </>
      )}
      <label>
        Timeout (milliseconds)
        <input
          name="timeout"
          type="number"
          min={1000}
          max={100000}
          defaultValue={60000}
        />
      </label>
      <label className="router-check">
        <input type="checkbox" name="enabled" defaultChecked /> Enabled
      </label>
      <button className="primary-btn" disabled={busy}>
        <KeyRound size={14} /> Save encrypted connection
      </button>
    </form>
  );
}
function ConnectionEditor({
  connection: c,
  busy,
  act,
}: {
  connection: Connection;
  busy: boolean;
  act: (v: unknown) => Promise<boolean>;
}) {
  return (
    <article className="router-panel">
      <div className="router-row">
        <h3>{c.label}</h3>
        <span>{connectionStatus(c)}</span>
      </div>
      <p>
        {c.maskedCredential} · {c.provider}
      </p>
      {c.checkedAt && (
        <small>
          Last checked {new Date(c.checkedAt).toLocaleString()}
          {c.latencyMs !== null ? ` · ${c.latencyMs} ms` : ""}
        </small>
      )}
      <form
        className="router-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await act({
            action: "update",
            id: c.id,
            model: d.get("model"),
            label: d.get("label"),
            priority: Number(d.get("priority")),
          });
        }}
      >
        <label>
          Name
          <input name="label" defaultValue={c.label} required />
        </label>
        <label>
          Selected chat model
          <input
            name="model"
            list={"models-" + c.id}
            defaultValue={c.model}
            required
          />
          <datalist id={"models-" + c.id}>
            {c.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Priority (lower first)
          <input
            name="priority"
            type="number"
            min={0}
            max={1000}
            defaultValue={c.priority}
          />
        </label>
        <button className="secondary-btn" disabled={busy}>
          Save model & priority
        </button>
      </form>
      <div className="router-actions">
        <button
          className="secondary-btn"
          disabled={busy || !c.enabled}
          onClick={() => void act({ action: "test", id: c.id })}
        >
          {busy ? "Testing…" : "Test / discover models"}
        </button>
        <button
          className="secondary-btn"
          disabled={busy}
          onClick={() =>
            void act({ action: "update", id: c.id, enabled: !c.enabled })
          }
        >
          {c.enabled ? "Disable" : "Enable"}
        </button>
        <button
          className="danger-btn"
          disabled={busy}
          onClick={() => void act({ action: "delete", id: c.id })}
        >
          Delete
        </button>
      </div>
    </article>
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
      className="router-panel router-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          d = new FormData(form);
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
        )
          if (!initial) form.reset();
      }}
    >
      <h2>{initial ? "Edit" : "Create"} pool</h2>
      <div className="router-two-col">
        <label>
          Name
          <input name="name" required defaultValue={initial?.name} />
        </label>
        <label>
          Selection strategy
          <select
            name="strategy"
            defaultValue={initial?.strategy || "priority"}
          >
            {[
              "priority",
              "round_robin",
              "least_recently_used",
              "health_aware",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Connection IDs in fallback order (one per line)
        <textarea
          name="connections"
          required
          defaultValue={initial?.connections.join("\n")}
        />
      </label>
      <details>
        <summary>Available connection IDs</summary>
        {connections.map((c) => (
          <p key={c.id}>
            {c.label} · {c.provider}
            <br />
            <code>{c.id}</code>
          </p>
        ))}
      </details>
      <button
        className="primary-btn"
        disabled={disabled || !connections.length}
      >
        Save pool
      </button>
    </form>
  );
}
function Topology({
  connections,
  pools,
}: {
  connections: Connection[];
  pools: PoolConfig[];
}) {
  const [pool, setPool] = useState("");
  const config = pools.find((p) => p.id === pool);
  const nodes = config
    ? config.connections
        .map((id) => connections.find((c) => c.id === id))
        .filter((c): c is Connection => !!c)
    : connections;
  const height = Math.max(260, nodes.length * 85 + 50);
  return (
    <div className="router-panel">
      <div className="router-row">
        <h2>Configured topology</h2>
        <select
          aria-label="Topology pool"
          value={pool}
          onChange={(e) => setPool(e.target.value)}
        >
          <option value="">All accounts</option>
          {pools.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {!nodes.length ? (
        <Empty text="No configured routes. Add your first provider connection." />
      ) : (
        <div className="router-graph">
          <svg
            viewBox={`0 0 900 ${height}`}
            role="img"
            aria-label="Configured account routing topology"
          >
            <defs>
              <marker
                id="route-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0 0 L6 3 L0 6" fill="currentColor" />
              </marker>
            </defs>
            <path
              className="route-edge"
              d={`M150 ${height / 2} H280`}
              markerEnd="url(#route-arrow)"
            />
            <rect x="10" y={height / 2 - 24} width="140" height="48" rx="12" />
            <text x="80" y={height / 2 + 5} textAnchor="middle">
              Your chat
            </text>
            <rect x="280" y={height / 2 - 28} width="160" height="56" rx="12" />
            <text x="360" y={height / 2 + 5} textAnchor="middle">
              Tern Router
            </text>
            {nodes.map((c, i) => {
              const y = 50 + i * 85;
              return (
                <g
                  key={c.id}
                  className={
                    !c.enabled || (config && !config.enabled)
                      ? "route-disabled"
                      : c.cooldownUntil && c.cooldownUntil > Date.now()
                        ? "route-cooldown"
                        : ""
                  }
                >
                  <path
                    className="route-edge"
                    d={`M440 ${height / 2} C510 ${height / 2} 495 ${y} 570 ${y}`}
                    markerEnd="url(#route-arrow)"
                  />
                  <rect x="570" y={y - 26} width="320" height="60" rx="10" />
                  <text x="587" y={y - 5}>
                    {c.provider} / {c.label.slice(0, 24)}
                  </text>
                  <text className="route-detail" x="587" y={y + 16}>
                    {c.model || "Model not selected"} · {connectionStatus(c)}
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
    <>
      <label className="provider-pill">
        <select
          aria-label="Routing model"
          value={model}
          onChange={(e) => onChange(e.target.value, pool)}
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
        className="router-pool-select"
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
    </>
  );
}
