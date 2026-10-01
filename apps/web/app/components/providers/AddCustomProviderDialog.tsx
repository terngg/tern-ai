"use client";

import React, { useState, useEffect } from "react";
import type { ProviderItem } from "@/lib/providers-data";
import { CheckCircle2, Globe, Key, Layers, Terminal, X } from "lucide-react";

interface AddCustomProviderDialogProps {
  isOpen: boolean;
  initialType?: "openai" | "anthropic" | "custom";
  onClose: () => void;
  onAdd: (provider: ProviderItem) => Promise<void>;
}

export function AddCustomProviderDialog({
  isOpen,
  initialType = "openai",
  onClose,
  onAdd,
}: AddCustomProviderDialogProps) {
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState<
    "OpenAI Compatible" | "Anthropic Compatible" | "Custom REST"
  >("OpenAI Compatible");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434/v1");
  const [apiKey, setApiKey] = useState("");
  const [customHeaders, setCustomHeaders] = useState("");
  const [modelsInput, setModelsInput] = useState("llama3.3, deepseek-r1");
  const [notes, setNotes] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialType === "anthropic") {
      setProviderType("Anthropic Compatible");
      setName("Anthropic Custom Gateway");
      setBaseUrl("https://api.anthropic.com/v1");
      setModelsInput("claude-3-7-sonnet, claude-3-5-sonnet");
    } else if (initialType === "openai") {
      setProviderType("OpenAI Compatible");
      setName("Local Ollama Server");
      setBaseUrl("http://localhost:11434/v1");
      setModelsInput("llama3.3:70b, qwen2.5-coder:32b");
    } else {
      setProviderType("Custom REST");
      setName("Custom REST Endpoint");
      setBaseUrl("https://api.myproxy.com/v1");
      setModelsInput("custom-model-1");
    }
  }, [initialType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const slug = `custom-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;

      const models = modelsInput
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);

      const parsedHeaders: Record<string, string> = {};
      if (customHeaders.trim()) {
        try {
          Object.assign(parsedHeaders, JSON.parse(customHeaders));
        } catch {
          // ignore or parse key=value lines
          customHeaders.split("\n").forEach((line) => {
            const [k, ...v] = line.split(":");
            if (k && v.length) parsedHeaders[k.trim()] = v.join(":").trim();
          });
        }
      }

      const newProvider: ProviderItem = {
        id: slug,
        name: name.trim(),
        slug,
        category: "custom",
        authType: "custom",
        description: notes.trim() || `${providerType} custom endpoint at ${baseUrl}`,
        brandColor:
          providerType === "Anthropic Compatible"
            ? "#D97706"
            : providerType === "OpenAI Compatible"
              ? "#10A37F"
              : "#8B5CF6",
        status: isEnabled ? (apiKey ? "connected" : "connected") : "disabled",
        connectionCount: isEnabled ? 1 : 0,
        badges: ["Custom", providerType.replace(" Compatible", ""), "Local/Proxy"],
        supportsCustomModels: true,
        defaultEndpoint: baseUrl.trim(),
        recommendedModel: models[0] || "default",
        availableModels: models,
        isCustom: true,
        connections: [
          {
            id: `conn-${slug}-primary`,
            providerId: slug,
            name: `${name} Primary`,
            status: isEnabled ? "connected" : "disabled",
            apiKey: apiKey.trim() || undefined,
            endpointUrl: baseUrl.trim(),
            models,
            enabled: isEnabled,
            latencyMs: 45,
            lastCheckedAt: new Date().toISOString(),
            customHeaders: Object.keys(parsedHeaders).length ? parsedHeaders : undefined,
          },
        ],
      };

      await onAdd(newProvider);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog">
        <div className="modal-head">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-text m-0">
              Add Custom AI Provider
            </h3>
          </div>
          <button onClick={onClose} className="icon-btn flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Type selector */}
            <div className="form-group">
              <label className="form-label">Provider Protocol / Format</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    "OpenAI Compatible",
                    "Anthropic Compatible",
                    "Custom REST",
                  ] as const
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setProviderType(type);
                      if (type === "OpenAI Compatible" && !baseUrl) {
                        setBaseUrl("http://localhost:11434/v1");
                      } else if (type === "Anthropic Compatible" && !baseUrl) {
                        setBaseUrl("https://api.anthropic.com/v1");
                      }
                    }}
                    className={`p-2 rounded-lg border text-center text-[10px] font-mono transition-colors ${
                      providerType === type
                        ? "bg-accent/15 border-accent text-accent font-bold"
                        : "bg-[var(--panel-2)] border-[var(--line)] text-muted hover:text-text"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Provider Name */}
            <div className="form-group">
              <label className="form-label">Provider Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Local Ollama, vLLM Production, LiteLLM Hub"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Base URL */}
            <div className="form-group">
              <label className="form-label flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-muted" />
                Base URL / Endpoint
              </label>
              <input
                type="text"
                required
                placeholder="http://localhost:11434/v1 or https://api.myproxy.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="form-input font-mono text-[11px]"
              />
              <span className="form-help">
                OpenAI protocol endpoints typically end in /v1. Ollama default: http://localhost:11434/v1
              </span>
            </div>

            {/* API Key */}
            <div className="form-group">
              <label className="form-label flex items-center gap-1.5">
                <Key className="w-3 h-3 text-muted" />
                API Key / Bearer Token (Optional)
              </label>
              <input
                type="password"
                placeholder="Leave blank for local Ollama / LM Studio without auth"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Models */}
            <div className="form-group">
              <label className="form-label flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-muted" />
                Model IDs (Comma-separated)
              </label>
              <input
                type="text"
                placeholder="llama3.3:70b, qwen2.5-coder:32b, deepseek-r1"
                value={modelsInput}
                onChange={(e) => setModelsInput(e.target.value)}
                className="form-input font-mono text-[11px]"
              />
              <span className="form-help">
                Models available through this endpoint. The first one will be set as recommended.
              </span>
            </div>

            {/* Custom Headers */}
            <div className="form-group">
              <label className="form-label">
                Custom Headers (Optional JSON or Header: Value)
              </label>
              <textarea
                placeholder='{"X-Custom-Tenant": "production", "HTTP-Referer": "tern.ai"}'
                value={customHeaders}
                onChange={(e) => setCustomHeaders(e.target.value)}
                className="form-textarea text-[10px]"
              />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">Notes / Description (Optional)</label>
              <input
                type="text"
                placeholder="Internal routing notes or server specs"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Enabled toggle */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-text font-medium">
                Enable this provider immediately for routing
              </span>
            </label>
          </div>

          <div className="modal-foot">
            <button
              type="button"
              onClick={onClose}
              className="secondary-btn text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="primary-btn inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isSubmitting ? "Adding…" : "Save Custom Provider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
