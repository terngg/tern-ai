import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ExternalLink,
  KeyRound,
  Plus,
  Server,
  Trash2,
  Copy,
  Laptop,
  RefreshCw,
} from "lucide-react";
import type {
  Connection,
  ProviderDefinition,
  CompanionStatus,
} from "../../../lib/router/types";
import { Select } from "../ui/Select";
import { SecretInput } from "../ui/SecretInput";
import { Form } from "../ui/Form";
import { useUI } from "../ui/UIProvider";
import { Drawer } from "../ui/Drawer";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProviderIcon } from "../ui/ProviderIcon";
import { getProviderColor } from "./providerColors";
import { connectionStatus } from "../providers/RouterDashboard";

interface ProviderDrawerProps {
  provider: ProviderDefinition | null;
  connections: Connection[];
  busy: boolean;
  signedIn: boolean;
  onClose: () => void;
  onAct: (body: unknown) => Promise<boolean>;
}

export function ProviderDrawer({
  provider,
  connections,
  busy,
  signedIn,
  onClose,
  onAct,
}: ProviderDrawerProps) {
  if (!provider) return null;

  const providerConnections = connections.filter(
    (c) => c.provider === provider.id,
  );
  const isImplemented = provider.adapterStatus === "implemented";

  return (
    <Drawer
      isOpen={Boolean(provider)}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <span
            className="size-7 rounded-md shrink-0 inline-flex items-center justify-center overflow-hidden"
            style={{
              backgroundColor: `${getProviderColor(provider.id)}18`,
              border: `1px solid ${getProviderColor(provider.id)}30`,
            }}
          >
            <ProviderIcon
              providerId={provider.id}
              alt={provider.name}
              size={20}
              className="max-w-[20px] max-h-[20px]"
              fallbackText={provider.name.slice(0, 2)}
              fallbackColor={getProviderColor(provider.id)}
            />
          </span>
          <span>{provider.name}</span>
        </span>
      }
      subtitle="Provider Connections"
      width="lg"
    >
      {provider.adapterStatus === "requires_companion" ||
      provider.auth === "local_companion" ? (
        <CompanionSection
          provider={provider}
          connections={providerConnections}
          signedIn={signedIn}
          busy={busy}
          onAct={onAct}
        />
      ) : !isImplemented ? (
        <div className="p-5 rounded-xl border border-border-subtle bg-surface-2/40 text-center flex flex-col items-center">
          <div className="size-10 rounded-full bg-surface-3 flex items-center justify-center text-text-muted mb-3">
            <Server size={20} />
          </div>
          <h3 className="text-sm font-semibold text-text-main mb-1">
            Unsupported
          </h3>
          <p className="text-xs text-text-muted max-w-md">
            Custom REST requires an explicit request and response mapping. No
            adapter is available yet.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-text-muted border-b border-border-subtle pb-3">
            <span>
              Saving a key creates an encrypted connection. Test discovers
              models.
            </span>
            {provider.docs && (
              <a
                href={provider.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline shrink-0 ml-2"
              >
                API Docs <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* Existing Connections */}
          {providerConnections.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Configured Connections ({providerConnections.length})
              </h4>
              {providerConnections.map((c) => (
                <ConnectionItem
                  key={c.id}
                  connection={c}
                  busy={busy}
                  onAct={onAct}
                />
              ))}
            </div>
          )}

          {/* Add Connection Form */}
          {signedIn ? (
            <AddConnectionForm provider={provider} busy={busy} onSave={onAct} />
          ) : (
            <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/30 text-xs text-text-muted text-center">
              Sign in to Tern AI to add encrypted connections.
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function ConnectionItem({
  connection: c,
  busy,
  onAct,
}: {
  connection: Connection;
  busy: boolean;
  onAct: (v: unknown) => Promise<boolean>;
}) {
  const status = connectionStatus(c);
  const isHealthy = ["Connected", "Healthy"].includes(status);
  const isError = [
    "Authentication failed",
    "Permission denied",
    "Rate limited",
    "Quota exhausted",
    "Provider error",
    "Network error",
  ].includes(status);

  return (
    <div className="router-panel p-4 rounded-xl border border-border-subtle bg-surface-2/30 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-main text-sm truncate">
              {c.label}
            </h3>
            <Badge
              variant={
                !c.enabled
                  ? "default"
                  : isHealthy
                    ? "success"
                    : isError
                      ? "error"
                      : "warning"
              }
              size="sm"
              dot
            >
              {status}
            </Badge>
          </div>
          <p className="text-xs text-text-subtle font-mono mt-0.5">
            {c.maskedCredential}
          </p>
        </div>

        {c.latencyMs !== null && (
          <span className="text-xs text-text-muted font-mono shrink-0">
            {c.latencyMs} ms
          </span>
        )}
      </div>

      <Form
        className="space-y-3 pt-2 border-t border-border-subtle/50 text-xs"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await onAct({
            action: "update",
            id: c.id,
            model: d.get("model"),
            label: d.get("label"),
            priority: Number(d.get("priority")),
          });
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-text-muted">
            Name
            <input
              name="label"
              defaultValue={c.label}
              required
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-text-muted">
            Priority (lower first)
            <input
              name="priority"
              type="number"
              min={0}
              max={1000}
              defaultValue={c.priority}
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-text-muted">
          Selected Chat Model
          <Select
            label={`Model for ${c.label}`}
            title="Select connection model"
            name="model"
            defaultValue={c.model}
            searchable
            allowCustom
            searchPlaceholder="Search or enter model ID…"
            options={[
              ...(!c.models.some((m) => m.id === c.model) && c.model
                ? [{ value: c.model, label: c.model }]
                : []),
              ...c.models.map((m) => ({
                value: m.id,
                label: m.name,
                description: m.id,
              })),
            ]}
          />
        </label>

        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
          <Button type="submit" size="xs" variant="secondary" disabled={busy}>
            Save changes
          </Button>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={busy || !c.enabled}
              onClick={() => void onAct({ action: "test", id: c.id })}
            >
              {busy ? "Testing…" : "Test / discover models"}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void onAct({ action: "update", id: c.id, enabled: !c.enabled })
              }
            >
              {c.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="danger"
              disabled={busy}
              icon={<Trash2 size={12} />}
              onClick={() => void onAct({ action: "delete", id: c.id })}
            >
              Delete
            </Button>
          </div>
        </div>
      </Form>
    </div>
  );
}

function AddConnectionForm({
  provider,
  busy,
  onSave,
}: {
  provider: ProviderDefinition;
  busy: boolean;
  onSave: (body: unknown) => Promise<boolean>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [formError, setFormError] = useState("");

  return (
    <Form
      ref={formRef}
      className="p-4 rounded-xl border border-border-subtle bg-surface space-y-3 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        setFormError("");
        const form = e.currentTarget;
        const d = new FormData(form);
        let headers: unknown = {};
        try {
          headers = JSON.parse(String(d.get("headers") || "{}"));
        } catch {
          setFormError("Custom headers must contain valid JSON.");
          form.querySelector<HTMLTextAreaElement>("[name=headers]")?.focus();
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

        if (await onSave(body)) form.reset();
      }}
    >
      <div className="flex items-center gap-1.5 font-semibold text-text-main text-sm pb-1 border-b border-border-subtle">
        <Plus size={14} className="text-primary" />
        Add connection
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-text-muted">
          Connection name
          <input
            name="label"
            required
            maxLength={80}
            placeholder="Personal, Work, Backup…"
            className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-text-muted">
          API key
          <SecretInput
            name="key"
            type="password"
            autoComplete="off"
            required
            minLength={8}
            maxLength={4096}
            placeholder="Enter API key"
            className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary font-mono"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-text-muted">
        Default chat model
        <input
          name="model"
          placeholder="Select after discovery, or enter a model ID"
          maxLength={200}
          className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
        />
      </label>

      {provider.category === "compatible" && (
        <div className="space-y-3 pt-1">
          <label className="flex flex-col gap-1 text-text-muted">
            API base URL
            <input
              name="baseUrl"
              type="url"
              required
              placeholder="https://api.example.com/v1"
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary font-mono"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-text-muted">
              Auth header
              <input
                name="authHeader"
                defaultValue={
                  provider.protocol === "anthropic"
                    ? "x-api-key"
                    : "Authorization"
                }
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-text-muted">
              Auth prefix
              <input
                name="authPrefix"
                defaultValue={
                  provider.protocol === "anthropic" ? "" : "Bearer "
                }
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-text-muted">
            Custom headers (JSON)
            <textarea
              name="headers"
              onChange={(e) => e.target.setCustomValidity("")}
              placeholder='{"X-Account": "value"}'
              rows={2}
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary font-mono"
            />
          </label>

          <label className="flex flex-col gap-1 text-text-muted">
            Model IDs (comma-separated)
            <input
              name="models"
              placeholder="model-1, model-2"
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
            />
          </label>
        </div>
      )}

      {formError && (
        <p role="alert" className="ui-field-error">
          {formError}
        </p>
      )}
      <div className="flex items-center justify-between pt-2">
        <label className="inline-flex items-center gap-2 cursor-pointer text-text-muted select-none">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked
            className="rounded border-border-subtle text-primary focus:ring-0"
          />
          <span>Enabled</span>
        </label>

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy}
          icon={<KeyRound size={14} />}
        >
          Save encrypted connection
        </Button>
      </div>
    </Form>
  );
}

function CompanionSection({
  provider,
  connections,
  signedIn,
  busy,
  onAct,
}: {
  provider: ProviderDefinition;
  connections: Connection[];
  signedIn: boolean;
  busy: boolean;
  onAct: (body: unknown) => Promise<boolean>;
}) {
  const { notify, copyText } = useUI();
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairCode, setPairCode] = useState<{
    code: string;
    expiresAt: number;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [statusError, setStatusError] = useState("");

  const fetchStatus = useCallback(async () => {
    if (!signedIn) return;
    try {
      setLoading(true);
      const res = await fetch("/api/router/companion", { cache: "no-store" });
      if (!res.ok) throw new Error("Companion status unavailable");
      if (res.ok) {
        setStatusError("");
        const data = (await res.json()) as CompanionStatus;
        setStatus(data);
      }
    } catch {
      setStatusError(
        "Could not load Companion status. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleGeneratePairCode = async () => {
    try {
      setGenerating(true);
      const res = await fetch("/api/router/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pair-code" }),
      });
      if (!res.ok) throw new Error("Pairing code unavailable");
      if (res.ok) {
        const data = (await res.json()) as { code: string; expiresAt: number };
        setPairCode(data);
      }
    } catch {
      notify(
        "Could not create a pairing code",
        "error",
        "Check your connection and try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    void copyText(text);
  };

  const detected = status?.detectedProviders?.find(
    (dp) => dp.id === provider.id,
  );

  return (
    <div className="space-y-5">
      {statusError && (
        <p role="alert" className="ui-field-error">
          {statusError}
        </p>
      )}
      {loading && !status && (
        <p role="status" className="text-xs text-text-muted">
          Loading Companion status…
        </p>
      )}
      {/* Header card with Requires Tern Companion heading to preserve test invariants */}
      <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/40 text-center flex flex-col items-center">
        <div className="size-10 rounded-full bg-surface-3 flex items-center justify-center text-text-muted mb-3">
          <Laptop size={20} />
        </div>
        <h3 className="text-sm font-semibold text-text-main mb-1">
          Requires Tern Companion
        </h3>
        <p className="text-xs text-text-muted max-w-md">
          {provider.name} runs directly on your local workstation through Tern
          Companion. Local credentials and session keys remain isolated on your
          machine and are never transmitted to the cloud.
        </p>
      </div>

      {!signedIn ? (
        <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/30 text-xs text-text-muted text-center">
          Sign in to Tern AI to pair your workstation and manage local
          providers.
        </div>
      ) : !status?.paired ? (
        <div className="p-4 rounded-xl border border-border-subtle bg-surface space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div>
              <h4 className="text-xs font-semibold text-text-main">
                Install & Pair Tern Companion
              </h4>
              <p className="text-[11px] text-text-muted mt-0.5">
                Connect your local CLI tools, desktop daemons, and models.
              </p>
            </div>
            <Badge variant="warning" size="sm" dot>
              Not paired
            </Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="font-semibold text-text-muted block mb-1">
                1. Install Tern Companion:
              </span>
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-bg border border-border-subtle font-mono text-[11px] text-text-main select-all flex items-center justify-between">
                  <code>
                    curl -fsSL https://tern-ai-swart.vercel.app/install.sh |
                    bash
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        "curl -fsSL https://tern-ai-swart.vercel.app/install.sh | bash",
                      )
                    }
                    className="text-text-muted hover:text-text-main cursor-pointer"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="p-2 rounded-lg bg-surface border border-border-subtle font-mono text-[10px] text-text-muted select-all flex items-center justify-between">
                  <span>npm install -g https://github.com/terngg/tern-ai</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        "npm install -g https://github.com/terngg/tern-ai",
                      )
                    }
                    className="text-text-muted hover:text-text-main cursor-pointer"
                  >
                    <Copy size={11} />
                  </button>
                </div>
                <p className="text-[11px] text-text-subtle">
                  Works on Linux, macOS, and Windows. No repository cloning
                  required.
                </p>
              </div>
            </div>

            <div>
              <span className="font-semibold text-text-muted block mb-1">
                2. Pair with one-time code:
              </span>
              {pairCode ? (
                <div className="space-y-1.5">
                  <div className="p-2.5 rounded-lg bg-bg border border-primary/40 font-mono text-[11px] text-primary select-all flex items-center justify-between">
                    <code>tern companion pair {pairCode.code}</code>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(`tern companion pair ${pairCode.code}`)
                      }
                      className="text-primary hover:underline text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Copy size={12} />
                      Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-text-subtle">
                    Code expires in 10 minutes. Pairing automatically syncs
                    local providers and launches the background daemon.
                  </p>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={generating}
                  onClick={handleGeneratePairCode}
                >
                  {generating
                    ? "Generating..."
                    : "Generate One-Time Pairing Code"}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Companion Connected Banner */}
          <div className="p-3.5 rounded-xl border border-green-500/20 bg-green-500/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`size-2 rounded-full ${status.connected ? "bg-green-500" : "bg-gray-500"}`}
              />
              <div>
                <div className="text-xs font-semibold text-text-main">
                  Tern Companion {status.connected ? "Online" : "Offline"}
                </div>
                <div className="text-[11px] text-text-muted font-mono">
                  {status.label} · {status.platform}
                </div>
              </div>
            </div>
            <Button
              size="xs"
              variant="secondary"
              icon={<RefreshCw size={11} />}
              disabled={loading}
              onClick={() => void fetchStatus()}
            >
              Refresh
            </Button>
          </div>

          {/* Local Provider Status */}
          <div className="p-4 rounded-xl border border-border-subtle bg-surface space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-main">
                Local Tool: {provider.name}
              </span>
              <Badge
                variant={
                  !status.connected || !detected?.installed
                    ? "default"
                    : detected.authenticated && detected.health.ok
                      ? "success"
                      : "warning"
                }
                size="sm"
                dot
              >
                {!status.connected
                  ? "Companion offline"
                  : !detected?.installed
                    ? "Not installed"
                    : !detected.authenticated
                      ? "Auth required"
                      : !detected.health.ok
                        ? "Local check failed"
                        : "Local check passed"}
              </Badge>
            </div>

            {detected?.installed ? (
              <div className="space-y-2 text-xs">
                {detected.version && (
                  <div className="text-text-muted">
                    Detected version:{" "}
                    <span className="font-mono text-text-main">
                      {detected.version}
                    </span>
                  </div>
                )}
                <div className="text-text-muted">
                  Authentication:{" "}
                  <span className="text-text-main">
                    {detected.authDetails ||
                      (detected.authenticated
                        ? "Authenticated"
                        : "Unauthenticated")}
                  </span>
                </div>
                {detected.models.length > 0 && (
                  <div>
                    <span className="text-text-muted block mb-1">
                      Discovered local models ({detected.models.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {detected.models.map((m) => (
                        <span
                          key={m.id}
                          className="px-2 py-0.5 rounded bg-surface-2 text-[11px] font-mono text-text-main border border-border-subtle"
                        >
                          {m.name || m.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                {provider.name} is not currently detected on this workstation.
                Install it locally to enable routing.
              </p>
            )}
          </div>

          {/* Configured Connections for this companion provider */}
          {connections.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Active Router Connections ({connections.length})
              </h4>
              {connections.map((c) => (
                <ConnectionItem
                  key={c.id}
                  connection={c}
                  busy={busy}
                  onAct={onAct}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
