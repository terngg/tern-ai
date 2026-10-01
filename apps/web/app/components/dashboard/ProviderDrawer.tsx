import React, { useRef } from "react";
import {
  ExternalLink,
  KeyRound,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import type { Connection, ProviderDefinition } from "../../../lib/router/types";
import { Drawer } from "../ui/Drawer";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
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
      title={provider.name}
      subtitle="Provider Connections"
      width="lg"
    >
      {!isImplemented ? (
        <div className="p-5 rounded-xl border border-border-subtle bg-surface-2/40 text-center flex flex-col items-center">
          <div className="size-10 rounded-full bg-surface-3 flex items-center justify-center text-text-muted mb-3">
            <Server size={20} />
          </div>
          <h3 className="text-sm font-semibold text-text-main mb-1">
            {provider.adapterStatus === "requires_companion"
              ? "Requires Tern Companion"
              : "Unsupported"}
          </h3>
          <p className="text-xs text-text-muted max-w-md">
            {provider.adapterStatus === "requires_companion"
              ? "This integration requires a local client or desktop session. A Tern Companion connection is not available yet."
              : "Custom REST requires an explicit request and response mapping. No adapter is available yet."}
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
            <AddConnectionForm
              provider={provider}
              busy={busy}
              onSave={onAct}
            />
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

      <form
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
          <input
            name="model"
            list={"models-" + c.id}
            defaultValue={c.model}
            required
            placeholder="e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash"
            className="px-2.5 py-1.5 rounded-lg border border-border-subtle bg-bg text-text-main text-xs outline-none focus:border-primary"
          />
          <datalist id={"models-" + c.id}>
            {c.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </label>

        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
          <Button
            type="submit"
            size="xs"
            variant="secondary"
            disabled={busy}
          >
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
              {busy ? "Testing…" : "Test / discover"}
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
      </form>
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

  return (
    <form
      ref={formRef}
      className="p-4 rounded-xl border border-border-subtle bg-surface space-y-3 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const d = new FormData(form);
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
          <input
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
    </form>
  );
}
