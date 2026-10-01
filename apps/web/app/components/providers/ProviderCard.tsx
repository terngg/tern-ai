"use client";

import React from "react";
import type { ProviderItem } from "@/lib/providers-data";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  Eye,
  MessageSquare,
  PowerOff,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";

interface ProviderCardProps {
  provider: ProviderItem;
  onClick: (provider: ProviderItem) => void;
  isTesting?: boolean;
}

export function ProviderCard({
  provider,
  onClick,
  isTesting = false,
}: ProviderCardProps) {
  const isConnected = provider.status === "connected";
  const isError = provider.status === "error";
  const isQuota = provider.status === "quota_low";
  const isDisabled = provider.status === "disabled";

  // Pick representative icon
  const renderProviderIcon = () => {
    const pId = provider.id;
    const cat = provider.category;

    if (pId.includes("claude") || pId.includes("anthropic")) {
      return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
    if (pId.includes("gemini") || pId.includes("antigravity")) {
      return <Zap className="w-4 h-4 text-blue-400" />;
    }
    if (pId.includes("openai") || pId.includes("codex")) {
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    }
    if (pId.includes("deepseek")) {
      return <Code2 className="w-4 h-4 text-indigo-400" />;
    }
    if (pId.includes("groq") || pId.includes("cerebras")) {
      return <Zap className="w-4 h-4 text-rose-400" />;
    }
    if (pId.includes("cursor") || pId.includes("cline") || pId.includes("copilot")) {
      return <Code2 className="w-4 h-4 text-cyan-400" />;
    }
    if (cat === "free") {
      return <Activity className="w-4 h-4 text-teal-400" />;
    }
    return <Terminal className="w-4 h-4 text-muted" />;
  };

  const renderBadgeIcon = (badge: string) => {
    const b = badge.toLowerCase();
    if (b.includes("code") || b.includes("cli")) return <Code2 className="w-2.5 h-2.5" />;
    if (b.includes("chat")) return <MessageSquare className="w-2.5 h-2.5" />;
    if (b.includes("vision")) return <Eye className="w-2.5 h-2.5" />;
    if (b.includes("tool") || b.includes("agent")) return <Wrench className="w-2.5 h-2.5" />;
    if (b.includes("fast") || b.includes("router")) return <Zap className="w-2.5 h-2.5" />;
    return null;
  };

  const statusLabel = () => {
    if (isTesting) return "Testing…";
    if (isConnected) return "Connected";
    if (isError) return "Error";
    if (isQuota) return "Quota low";
    if (isDisabled) return "Disabled";
    return "No connections";
  };

  return (
    <div
      className={`provider-card ${isConnected ? "card-connected" : ""} ${isError ? "card-error" : ""}`}
      onClick={() => onClick(provider)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(provider);
        }
      }}
      title={`Configure ${provider.name}`}
    >
      {/* 9Router Cable Connection Socket Accent */}
      <div className="card-cable-socket">
        <span
          className={`socket-pin ${
            isConnected
              ? "pin-connected"
              : isError
                ? "pin-error"
                : isQuota
                  ? "pin-quota"
                  : ""
          }`}
          title={statusLabel()}
        />
      </div>

      <div>
        <div className="card-top-row">
          <div
            className="provider-card-icon"
            style={{
              borderColor: provider.brandColor
                ? `${provider.brandColor}33`
                : undefined,
              backgroundColor: provider.brandColor
                ? `${provider.brandColor}15`
                : undefined,
            }}
          >
            {renderProviderIcon()}
          </div>

          <div className="provider-card-text">
            <strong>{provider.name}</strong>
            <small>
              {provider.recommendedModel ||
                provider.defaultEndpoint ||
                provider.description}
            </small>
          </div>
        </div>

        <div className="card-mid-row">
          <span
            className={`conn-count-label ${
              provider.connectionCount > 0 ? "has-conn" : ""
            }`}
          >
            {provider.connectionCount > 0
              ? `${provider.connectionCount} ${
                  provider.connectionCount === 1 ? "Connected" : "Connected"
                }`
              : "No connections"}
          </span>

          <span
            className={`conn-status-tag ${
              isTesting
                ? "quota_low"
                : isConnected
                  ? "connected"
                  : isError
                    ? "error"
                    : isQuota
                      ? "quota_low"
                      : isDisabled
                        ? "disabled"
                        : ""
            }`}
          >
            {isTesting ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 animate-spin" />
                Testing…
              </span>
            ) : isConnected ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Connected
              </span>
            ) : isError ? (
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" />
                Error
              </span>
            ) : isDisabled ? (
              <span className="inline-flex items-center gap-1">
                <PowerOff className="w-2.5 h-2.5" />
                Disabled
              </span>
            ) : (
              "Offline"
            )}
          </span>
        </div>
      </div>

      {/* Badges row */}
      <div className="card-bottom-row">
        {provider.badges.slice(0, 3).map((badge, idx) => (
          <span key={idx} className="card-badge inline-flex items-center gap-1">
            {renderBadgeIcon(badge)}
            {badge}
          </span>
        ))}
        {provider.connections.length > 0 &&
          provider.connections[0]?.latencyMs && (
            <span
              className="card-badge"
              style={{ color: "var(--accent)", marginLeft: "auto" }}
            >
              {provider.connections[0].latencyMs}ms
            </span>
          )}
      </div>
    </div>
  );
}
