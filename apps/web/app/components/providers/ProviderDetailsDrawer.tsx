"use client";

import React, { useState } from "react";
import type { ProviderItem, ProviderConnection } from "@/lib/providers-data";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Layers,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  X,
  Zap,
} from "lucide-react";

interface ProviderDetailsDrawerProps {
  provider: ProviderItem | null;
  onClose: () => void;
  onSaveConnection: (
    providerId: string,
    connection: Omit<ProviderConnection, "id"> & { id?: string },
  ) => Promise<void>;
  onDeleteConnection: (providerId: string, connectionId: string) => Promise<void>;
  onToggleConnection: (
    providerId: string,
    connectionId: string,
    enabled: boolean,
  ) => Promise<void>;
  onTestConnection: (
    providerId: string,
    connection: ProviderConnection,
  ) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export function ProviderDetailsDrawer({
  provider,
  onClose,
  onSaveConnection,
  onDeleteConnection,
  onToggleConnection,
  onTestConnection,
}: ProviderDetailsDrawerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [connName, setConnName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingConnId, setTestingConnId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    msg: string;
  } | null>(null);

  if (!provider) return null;

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connName.trim()) return;
    setIsSubmitting(true);
    try {
      await onSaveConnection(provider.id, {
        providerId: provider.id,
        name: connName.trim(),
        status: apiKey.trim() ? "connected" : "disconnected",
        apiKey: apiKey.trim(),
        endpointUrl: endpointUrl.trim() || undefined,
        models: selectedModel.trim()
          ? [selectedModel.trim()]
          : provider.availableModels,
        enabled: true,
        lastCheckedAt: new Date().toISOString(),
        latencyMs: 95,
      });
      setConnName("");
      setApiKey("");
      setEndpointUrl("");
      setSelectedModel("");
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async (conn: ProviderConnection) => {
    setTestingConnId(conn.id);
    setTestResult(null);
    try {
      const res = await onTestConnection(provider.id, conn);
      setTestResult({
        id: conn.id,
        ok: res.ok,
        msg: res.ok
          ? `Connected (${res.latencyMs || 85}ms)`
          : res.error || "Connection failed.",
      });
    } finally {
      setTestingConnId(null);
    }
  };

  const maskSecret = (secret?: string) => {
    if (!secret) return "None configured";
    if (secret.length <= 8) return "••••••••";
    return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
  };

  return (
    <div
      className="drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-panel">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
              style={{
                backgroundColor: provider.brandColor
                  ? `${provider.brandColor}20`
                  : "var(--panel-3)",
                color: provider.brandColor || "var(--accent)",
                border: "1px solid var(--line-strong)",
              }}
            >
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold m-0 flex items-center gap-2">
                {provider.name}
                <span
                  className={`conn-status-tag ${
                    provider.status === "connected"
                      ? "connected"
                      : provider.status === "error"
                        ? "error"
                        : ""
                  }`}
                >
                  {provider.status}
                </span>
              </h2>
              <p className="text-xs text-muted m-0 mt-0.5">
                Category:{" "}
                <span className="capitalize font-mono text-[10px]">
                  {provider.category.replace("_", " ")}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {provider.docsUrl && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="icon-btn flex items-center justify-center"
                title="Open Provider Documentation"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="icon-btn flex items-center justify-center"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Overview Card */}
          <div className="drawer-section">
            <div className="p-3.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-xs text-[var(--muted)]">
              <p className="m-0 mb-2">{provider.description}</p>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--line)]">
                <span className="font-mono text-[9px] text-[var(--subtle)]">
                  AUTH TYPE:
                </span>
                <span className="card-badge uppercase font-mono">
                  {provider.authType}
                </span>
                {provider.recommendedModel && (
                  <>
                    <span className="font-mono text-[9px] text-[var(--subtle)] ml-2">
                      DEFAULT MODEL:
                    </span>
                    <span className="card-badge font-mono text-accent">
                      {provider.recommendedModel}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Multi-Connection Accounts Section */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <span>
                Configured Connections ({provider.connections.length})
              </span>
              <button
                className="text-btn inline-flex items-center gap-1 font-sans font-semibold text-xs"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="w-3 h-3" />
                {showAddForm ? "Cancel" : "Add Connection"}
              </button>
            </div>

            {/* Add connection form */}
            {showAddForm && (
              <form
                onSubmit={handleCreateConnection}
                className="p-4 mb-4 rounded-lg border border-[var(--accent)] bg-[var(--panel-2)]"
              >
                <h4 className="text-xs font-bold text-[var(--text)] m-0 mb-3 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-accent" />
                  New {provider.name} Connection
                </h4>

                <div className="form-group">
                  <label className="form-label">Connection Name / Label</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Primary Account, Work Key, Backup"
                    value={connName}
                    onChange={(e) => setConnName(e.target.value)}
                    className="form-input"
                  />
                </div>

                {provider.authType === "api_key" && (
                  <div className="form-group">
                    <label className="form-label">API Key</label>
                    <div className="relative flex items-center">
                      <input
                        type={revealKey ? "text" : "password"}
                        required
                        placeholder="sk-... or API Token"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="form-input pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setRevealKey(!revealKey)}
                        className="absolute right-2 text-muted hover:text-text"
                      >
                        {revealKey ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {(provider.supportsCustomModels ||
                  provider.category === "compatible" ||
                  provider.category === "custom") && (
                  <div className="form-group">
                    <label className="form-label">
                      Endpoint Base URL (Optional override)
                    </label>
                    <input
                      type="url"
                      placeholder={
                        provider.defaultEndpoint || "https://api.example.com/v1"
                      }
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      className="form-input"
                    />
                  </div>
                )}

                {provider.availableModels &&
                  provider.availableModels.length > 0 && (
                    <div className="form-group">
                      <label className="form-label">Preferred Model</label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="form-select"
                      >
                        <option value="">
                          Default ({provider.recommendedModel})
                        </option>
                        {provider.availableModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="secondary-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="primary-btn flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    Save & Connect
                  </button>
                </div>
              </form>
            )}

            {/* List of connections */}
            {provider.connections.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-dashed border-[var(--line-strong)] text-muted text-xs">
                <Power className="w-6 h-6 mx-auto mb-2 text-subtle" />
                <p className="m-0 mb-2 font-medium">
                  No active accounts configured for {provider.name}
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="secondary-btn inline-flex items-center gap-1 text-xs"
                >
                  <Plus className="w-3 h-3" />
                  Add First Connection
                </button>
              </div>
            ) : (
              provider.connections.map((conn) => (
                <div key={conn.id} className="connection-item">
                  <div className="connection-item-top">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          conn.enabled && conn.status === "connected"
                            ? "bg-green-400 shadow-[0_0_8px_#4ade80]"
                            : "bg-neutral-500"
                        }`}
                      />
                      <strong className="text-xs font-semibold text-text">
                        {conn.name}
                      </strong>
                      {conn.isPrimary && (
                        <span className="card-badge text-accent border-accent/40">
                          Primary
                        </span>
                      )}
                    </div>

                    <div className="connection-item-actions">
                      <button
                        onClick={() => handleTest(conn)}
                        disabled={testingConnId === conn.id}
                        className="test-all-btn text-[9px] py-1 px-2"
                        title="Ping & Test Connection"
                      >
                        {testingConnId === conn.id ? (
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Activity className="w-2.5 h-2.5" />
                        )}
                        Test
                      </button>

                      <button
                        onClick={() =>
                          onToggleConnection(
                            provider.id,
                            conn.id,
                            !conn.enabled,
                          )
                        }
                        className={`test-all-btn text-[9px] py-1 px-2 ${
                          conn.enabled ? "text-accent" : "text-subtle"
                        }`}
                        title={conn.enabled ? "Disable connection" : "Enable connection"}
                      >
                        <Power className="w-2.5 h-2.5" />
                        {conn.enabled ? "Active" : "Disabled"}
                      </button>

                      <button
                        onClick={() => onDeleteConnection(provider.id, conn.id)}
                        className="icon-btn text-red hover:bg-red/10 w-6 h-6 flex items-center justify-center"
                        title="Disconnect / Remove account"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-muted flex flex-wrap gap-y-1 gap-x-4">
                    {conn.apiKey && (
                      <div>
                        <span className="text-subtle">Key:</span>{" "}
                        {maskSecret(conn.apiKey)}
                      </div>
                    )}
                    {conn.latencyMs && (
                      <div>
                        <span className="text-subtle">Latency:</span>{" "}
                        <span className="text-green-400">
                          {conn.latencyMs}ms
                        </span>
                      </div>
                    )}
                    {conn.lastCheckedAt && (
                      <div>
                        <span className="text-subtle">Checked:</span>{" "}
                        {new Date(conn.lastCheckedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>

                  {testResult && testResult.id === conn.id && (
                    <div
                      className={`mt-2 p-1.5 rounded text-[10px] font-mono flex items-center gap-1.5 ${
                        testResult.ok
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      {testResult.msg}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Capabilities & Supported Models */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Capabilities & Models
              </span>
            </div>

            <div className="drawer-badges-wrap">
              {provider.badges.map((b, idx) => (
                <span key={idx} className="card-badge">
                  {b}
                </span>
              ))}
            </div>

            {provider.availableModels && (
              <div className="border border-[var(--line)] rounded-lg p-3 bg-[var(--bg)]">
                <span className="text-[10px] font-mono text-subtle block mb-1.5">
                  AVAILABLE MODELS ({provider.availableModels.length})
                </span>
                <div className="drawer-model-chips">
                  {provider.availableModels.map((m) => (
                    <span key={m} className="drawer-model-chip">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
