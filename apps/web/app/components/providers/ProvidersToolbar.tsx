"use client";

import React from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";

export type FilterCategory =
  | "all"
  | "connected"
  | "disconnected"
  | "oauth"
  | "free"
  | "api_key"
  | "compatible";

interface ProvidersToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: FilterCategory;
  onFilterChange: (filter: FilterCategory) => void;
  counts: Record<FilterCategory, number>;
  onTestAll: () => Promise<void>;
  isTestingAll: boolean;
  onOpenAddCustom: () => void;
}

export function ProvidersToolbar({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  counts,
  onTestAll,
  isTestingAll,
  onOpenAddCustom,
}: ProvidersToolbarProps) {
  const tabs: Array<{ id: FilterCategory; label: string }> = [
    { id: "all", label: "All Providers" },
    { id: "connected", label: "Connected" },
    { id: "oauth", label: "OAuth" },
    { id: "free", label: "Free" },
    { id: "api_key", label: "API Keys" },
    { id: "compatible", label: "Custom / Compatible" },
    { id: "disconnected", label: "Offline" },
  ];

  return (
    <div className="providers-toolbar">
      <div className="toolbar-top-row">
        {/* Search bar */}
        <div className="search-input-wrap">
          <Search className="w-3.5 h-3.5 text-muted flex-none" />
          <input
            type="text"
            placeholder="Search AI providers, models, or protocols (e.g. OpenAI, Claude, DeepSeek, Ollama)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="text-subtle hover:text-text"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Global Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTestAll}
            disabled={isTestingAll}
            className="test-all-btn"
            title="Ping and test all providers"
          >
            <RefreshCw
              className={`w-3 h-3 ${isTestingAll ? "animate-spin text-accent" : "text-muted"}`}
            />
            {isTestingAll ? "Testing All…" : "Test All Endpoints"}
          </button>

          <button
            onClick={onOpenAddCustom}
            className="add-provider-btn primary text-xs py-1.5 px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Custom Provider
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs-row">
        {tabs.map((tab) => {
          const count = counts[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id)}
              className={`filter-tab-btn ${
                activeFilter === tab.id ? "active" : ""
              }`}
            >
              <span>{tab.label}</span>
              <span className="filter-tab-badge">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
