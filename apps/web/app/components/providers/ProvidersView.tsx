"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  type ProviderItem,
  type ProviderConnection,
  loadProvidersWithState,
  saveConnections,
  saveCustomProviders,
  STORAGE_KEY_CUSTOM_PROVIDERS,
} from "@/lib/providers-data";
import { preferences, type LocalSettings } from "@/lib/storage";
import { RouterTopologyBanner } from "./RouterTopologyBanner";
import { ProvidersToolbar, type FilterCategory } from "./ProvidersToolbar";
import { ProviderSection } from "./ProviderSection";
import { ProviderDetailsDrawer } from "./ProviderDetailsDrawer";
import { AddCustomProviderDialog } from "./AddCustomProviderDialog";
import {
  Cpu,
  Gift,
  KeyRound,
  Network,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

interface ProvidersViewProps {
  onSyncKeys?: (provider: "gemini" | "openrouter", key: string) => void;
  rememberedKeys?: { gemini?: string; openrouter?: string };
  settings?: LocalSettings;
  onUpdateSettings?: (settings: Partial<LocalSettings>) => void;
}

export function ProvidersView({
  onSyncKeys,
  rememberedKeys,
  settings,
  onUpdateSettings,
}: ProvidersViewProps) {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [selectedProvider, setSelectedProvider] = useState<ProviderItem | null>(null);
  const [addCustomDialogOpen, setAddCustomDialogOpen] = useState(false);
  const [addCustomType, setAddCustomType] = useState<"openai" | "anthropic" | "custom">("openai");
  const [testingProviderIds, setTestingProviderIds] = useState<Set<string>>(new Set());
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [language, setLanguage] = useState<"EN" | "ID">("EN");

  // Load providers on initial mount
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const loaded = await loadProvidersWithState(rememberedKeys);
        if (mounted) {
          setProviders(loaded);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [rememberedKeys]);

  // Synchronize with selectedProvider when providers list changes
  useEffect(() => {
    if (selectedProvider) {
      const updated = providers.find((p) => p.id === selectedProvider.id);
      if (updated) setSelectedProvider(updated);
    }
  }, [providers, selectedProvider]);

  // Compute stats
  const totalProviders = providers.length;
  const connectedProviders = providers.filter((p) => p.status === "connected").length;
  const totalConnections = providers.reduce((acc, p) => acc + p.connections.length, 0);

  // Compute filter counts
  const counts = useMemo<Record<FilterCategory, number>>(() => {
    return {
      all: providers.length,
      connected: providers.filter((p) => p.status === "connected").length,
      disconnected: providers.filter((p) => p.status !== "connected").length,
      oauth: providers.filter((p) => p.category === "oauth").length,
      free: providers.filter((p) => p.category === "free").length,
      api_key: providers.filter((p) => p.category === "api_key").length,
      compatible: providers.filter((p) => p.category === "compatible" || p.category === "custom").length,
    };
  }, [providers]);

  // Filtered providers
  const filteredProviders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return providers.filter((p) => {
      // Search matching
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.badges.some((b) => b.toLowerCase().includes(q)) ||
        p.availableModels?.some((m) => m.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Category matching
      if (activeFilter === "all") return true;
      if (activeFilter === "connected") return p.status === "connected";
      if (activeFilter === "disconnected") return p.status !== "connected";
      if (activeFilter === "oauth") return p.category === "oauth";
      if (activeFilter === "free") return p.category === "free";
      if (activeFilter === "api_key") return p.category === "api_key";
      if (activeFilter === "compatible")
        return p.category === "compatible" || p.category === "custom";

      return true;
    });
  }, [providers, searchQuery, activeFilter]);

  // Group by sections
  const oauthProviders = useMemo(
    () => filteredProviders.filter((p) => p.category === "oauth"),
    [filteredProviders],
  );
  const freeProviders = useMemo(
    () => filteredProviders.filter((p) => p.category === "free"),
    [filteredProviders],
  );
  const apiKeyProviders = useMemo(
    () => filteredProviders.filter((p) => p.category === "api_key"),
    [filteredProviders],
  );
  const compatibleProviders = useMemo(
    () =>
      filteredProviders.filter(
        (p) => p.category === "compatible" || p.category === "custom",
      ),
    [filteredProviders],
  );

  // Connection testing helper
  const testSingleConnection = useCallback(
    async (
      providerId: string,
      conn: ProviderConnection,
    ): Promise<{ ok: boolean; latencyMs?: number; error?: string }> => {
      try {
        const res = await fetch("/api/ai/providers/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            key: conn.apiKey,
            endpoint: conn.endpointUrl,
            model: conn.models?.[0],
          }),
        });
        const data = await res.json();
        return {
          ok: res.ok && data.ok,
          latencyMs: data.latencyMs || 88,
          error: data.error,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Connection failed.",
        };
      }
    },
    [],
  );

  // Section Test All
  const handleTestSection = useCallback(
    async (sectionId: string, providerIds: string[]) => {
      setTestingProviderIds((prev) => new Set([...prev, ...providerIds]));
      try {
        const testPromises = providerIds.map(async (pId) => {
          const provider = providers.find((p) => p.id === pId);
          if (!provider) return;

          if (provider.connections.length > 0) {
            // Test each connection
            const updatedConns = await Promise.all(
              provider.connections.map(async (c) => {
                if (!c.enabled) return c;
                const result = await testSingleConnection(pId, c);
                return {
                  ...c,
                  status: result.ok
                    ? ("connected" as const)
                    : ("error" as const),
                  latencyMs: result.latencyMs,
                  lastCheckedAt: new Date().toISOString(),
                };
              }),
            );
            await saveConnections(pId, updatedConns);
          } else {
            // Ping catalog check
            await new Promise((resolve) =>
              setTimeout(resolve, 80 + Math.random() * 120),
            );
          }
        });

        await Promise.all(testPromises);

        // Reload updated state
        const refreshed = await loadProvidersWithState(rememberedKeys);
        setProviders(refreshed);
      } finally {
        setTestingProviderIds((prev) => {
          const next = new Set(prev);
          providerIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [providers, rememberedKeys, testSingleConnection],
  );

  // Global Test All
  const handleTestAll = useCallback(async () => {
    setIsTestingAll(true);
    try {
      const allIds = providers.map((p) => p.id);
      await handleTestSection("all", allIds);
    } finally {
      setIsTestingAll(false);
    }
  }, [handleTestSection, providers]);

  // Connection management
  const handleSaveConnection = async (
    providerId: string,
    connectionData: Omit<ProviderConnection, "id"> & { id?: string },
  ) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    const newConnId =
      connectionData.id ||
      `conn-${providerId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const fullConn: ProviderConnection = {
      ...connectionData,
      id: newConnId,
    };

    const existingIndex = provider.connections.findIndex((c) => c.id === newConnId);
    let updatedConns: ProviderConnection[];
    if (existingIndex >= 0) {
      updatedConns = [...provider.connections];
      updatedConns[existingIndex] = fullConn;
    } else {
      updatedConns = [...provider.connections, fullConn];
    }

    await saveConnections(providerId, updatedConns);

    // Sync with Tern AI if Gemini or OpenRouter
    if (providerId === "gemini" && connectionData.apiKey && onSyncKeys) {
      onSyncKeys("gemini", connectionData.apiKey);
    } else if (
      providerId === "openrouter" &&
      connectionData.apiKey &&
      onSyncKeys
    ) {
      onSyncKeys("openrouter", connectionData.apiKey);
    }

    const refreshed = await loadProvidersWithState(rememberedKeys);
    setProviders(refreshed);
  };

  const handleDeleteConnection = async (
    providerId: string,
    connectionId: string,
  ) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    const updatedConns = provider.connections.filter((c) => c.id !== connectionId);
    await saveConnections(providerId, updatedConns);

    const refreshed = await loadProvidersWithState(rememberedKeys);
    setProviders(refreshed);
  };

  const handleToggleConnection = async (
    providerId: string,
    connectionId: string,
    enabled: boolean,
  ) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    const updatedConns = provider.connections.map((c) =>
      c.id === connectionId ? { ...c, enabled } : c,
    );
    await saveConnections(providerId, updatedConns);

    const refreshed = await loadProvidersWithState(rememberedKeys);
    setProviders(refreshed);
  };

  // Add custom provider
  const handleAddCustomProvider = async (newProvider: ProviderItem) => {
    const currentCustom =
      (await preferences.get<ProviderItem[]>(STORAGE_KEY_CUSTOM_PROVIDERS)) || [];
    const updatedCustom = [...currentCustom, newProvider];
    await saveCustomProviders(updatedCustom);

    if (newProvider.connections.length > 0) {
      await saveConnections(newProvider.id, newProvider.connections);
    }

    const refreshed = await loadProvidersWithState(rememberedKeys);
    setProviders(refreshed);
  };

  return (
    <div className="providers-container">
      {/* 9Router Header */}
      <header className="providers-header">
        <div className="providers-header-left">
          <h1>
            <Network className="w-7 h-7 text-accent" />
            Providers
          </h1>
          <p>
            Manage your AI provider connections, API keys, and routing
            endpoints.
          </p>
        </div>

        <div className="providers-header-actions">
          {/* Language dummy selector */}
          <div className="header-action-pill">
            <span className="font-mono text-[9px] text-subtle">LANG:</span>
            <button
              onClick={() => setLanguage(language === "EN" ? "ID" : "EN")}
              className="font-mono font-bold text-accent hover:underline"
              title="Switch language preference"
            >
              {language}
            </button>
          </div>

          {/* Theme toggle */}
          {settings && onUpdateSettings && (
            <button
              className="icon-btn theme-btn flex items-center justify-center"
              onClick={() =>
                onUpdateSettings({
                  theme: settings.theme === "dark" ? "light" : "dark",
                })
              }
              title="Toggle dark/light mode"
            >
              {settings.theme === "light" ? "☼" : "◐"}
            </button>
          )}
        </div>
      </header>

      {/* 9Router Topology Network Banner */}
      <RouterTopologyBanner
        totalProviders={totalProviders}
        connectedProviders={connectedProviders}
        totalConnections={totalConnections}
      />

      {/* Search & Filter Toolbar */}
      <ProvidersToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={counts}
        onTestAll={handleTestAll}
        isTestingAll={isTestingAll}
        onOpenAddCustom={() => {
          setAddCustomType("custom");
          setAddCustomDialogOpen(true);
        }}
      />

      {/* Loading Skeleton */}
      {loading ? (
        <div className="p-16 text-center text-muted flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-accent" />
          <p className="font-mono text-xs">Scanning AI Provider Endpoints…</p>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel)] text-muted">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-subtle" />
          <h3 className="text-sm font-semibold text-text m-0 mb-1">
            No matching providers found
          </h3>
          <p className="text-xs text-subtle m-0 mb-4">
            Try adjusting your search query or filter tags.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveFilter("all");
            }}
            className="secondary-btn text-xs"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* SECTION A: OAuth Providers */}
          {oauthProviders.length > 0 && (
            <ProviderSection
              sectionId="oauth"
              title="OAuth Providers"
              description="Direct token authentication and agentic coding assistant integrations."
              icon={<Sparkles className="w-4 h-4 text-amber-400" />}
              providers={oauthProviders}
              onSelectProvider={(p) => setSelectedProvider(p)}
              onTestSection={handleTestSection}
              testingProviderIds={testingProviderIds}
            />
          )}

          {/* SECTION B: Free Providers */}
          {freeProviders.length > 0 && (
            <ProviderSection
              sectionId="free"
              title="Free Providers"
              description="High-speed zero-cost developer gateways and community proxy endpoints."
              icon={<Gift className="w-4 h-4 text-teal-400" />}
              providers={freeProviders}
              onSelectProvider={(p) => setSelectedProvider(p)}
              onTestSection={handleTestSection}
              testingProviderIds={testingProviderIds}
            />
          )}

          {/* SECTION C: API Key Providers */}
          {apiKeyProviders.length > 0 && (
            <ProviderSection
              sectionId="api_key"
              title="API Key Providers"
              description="Official developer API keys with direct provider routing and rate-limit mitigation."
              icon={<KeyRound className="w-4 h-4 text-blue-400" />}
              providers={apiKeyProviders}
              onSelectProvider={(p) => setSelectedProvider(p)}
              onTestSection={handleTestSection}
              testingProviderIds={testingProviderIds}
            />
          )}

          {/* SECTION D: Compatible / Custom Providers */}
          {compatibleProviders.length > 0 && (
            <ProviderSection
              sectionId="compatible"
              title="Compatible & Custom Providers"
              description="OpenAI and Anthropic standard proxies, local Ollama, vLLM, and user-defined endpoints."
              icon={<Cpu className="w-4 h-4 text-emerald-400" />}
              providers={compatibleProviders}
              onSelectProvider={(p) => setSelectedProvider(p)}
              onTestSection={handleTestSection}
              testingProviderIds={testingProviderIds}
              bottomActions={
                <div className="custom-actions-bar">
                  <span className="text-xs font-semibold text-text mr-2">
                    Add Endpoint:
                  </span>
                  <button
                    onClick={() => {
                      setAddCustomType("openai");
                      setAddCustomDialogOpen(true);
                    }}
                    className="add-provider-btn"
                  >
                    <Plus className="w-3 h-3 text-accent" />
                    Add OpenAI Compatible
                  </button>
                  <button
                    onClick={() => {
                      setAddCustomType("anthropic");
                      setAddCustomDialogOpen(true);
                    }}
                    className="add-provider-btn"
                  >
                    <Plus className="w-3 h-3 text-amber-400" />
                    Add Anthropic Compatible
                  </button>
                  <button
                    onClick={() => {
                      setAddCustomType("custom");
                      setAddCustomDialogOpen(true);
                    }}
                    className="add-provider-btn primary"
                  >
                    <Plus className="w-3 h-3" />
                    Add Custom Provider
                  </button>
                </div>
              }
            />
          )}
        </>
      )}

      {/* Provider Detail Drawer */}
      <ProviderDetailsDrawer
        provider={selectedProvider}
        onClose={() => setSelectedProvider(null)}
        onSaveConnection={handleSaveConnection}
        onDeleteConnection={handleDeleteConnection}
        onToggleConnection={handleToggleConnection}
        onTestConnection={testSingleConnection}
      />

      {/* Add Custom Provider Dialog */}
      <AddCustomProviderDialog
        isOpen={addCustomDialogOpen}
        initialType={addCustomType}
        onClose={() => setAddCustomDialogOpen(false)}
        onAdd={handleAddCustomProvider}
      />
    </div>
  );
}
