"use client";

import React, { useState } from "react";
import type { ProviderItem } from "@/lib/providers-data";
import { ProviderCard } from "./ProviderCard";
import { Check, Play, RefreshCw } from "lucide-react";

interface ProviderSectionProps {
  sectionId: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  providers: ProviderItem[];
  onSelectProvider: (provider: ProviderItem) => void;
  onTestSection?: (sectionId: string, providerIds: string[]) => Promise<void>;
  testingProviderIds?: Set<string>;
  bottomActions?: React.ReactNode;
}

export function ProviderSection({
  sectionId,
  title,
  description,
  icon,
  providers,
  onSelectProvider,
  onTestSection,
  testingProviderIds = new Set(),
  bottomActions,
}: ProviderSectionProps) {
  const [isSectionTesting, setIsSectionTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  const connectedCount = providers.filter(
    (p) => p.status === "connected",
  ).length;

  const handleTestAll = async () => {
    if (!onTestSection || isSectionTesting) return;
    setIsSectionTesting(true);
    setTestSuccess(false);
    try {
      await onTestSection(
        sectionId,
        providers.map((p) => p.id),
      );
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    } finally {
      setIsSectionTesting(false);
    }
  };

  return (
    <section className="provider-section" id={`section-${sectionId}`}>
      <div className="section-cable-accent" />

      <div className="section-head">
        <div>
          <div className="section-title-wrap">
            <h3>
              {icon}
              {title}
            </h3>
            <span className="section-count-chip">
              {providers.length} {providers.length === 1 ? "Provider" : "Providers"}
              {connectedCount > 0 ? ` • ${connectedCount} Active` : ""}
            </span>
          </div>
          <p className="section-desc">{description}</p>
        </div>

        {onTestSection && providers.length > 0 && (
          <button
            className="test-all-btn"
            onClick={handleTestAll}
            disabled={isSectionTesting}
            title={`Run connection tests for all ${providers.length} ${title}`}
          >
            {isSectionTesting ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-accent" />
                Testing {providers.length}…
              </>
            ) : testSuccess ? (
              <>
                <Check className="w-3 h-3 text-green" />
                Tested
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-muted" />
                Test All
              </>
            )}
          </button>
        )}
      </div>

      <div className="provider-cards-grid">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onClick={onSelectProvider}
            isTesting={testingProviderIds.has(provider.id)}
          />
        ))}
      </div>

      {bottomActions && <div className="section-bottom-wrap">{bottomActions}</div>}
    </section>
  );
}
