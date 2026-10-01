"use client";

import React from "react";
import { Activity, Network, Radio, ShieldCheck, Zap } from "lucide-react";

interface RouterTopologyBannerProps {
  totalProviders: number;
  connectedProviders: number;
  totalConnections: number;
  avgLatencyMs?: number;
}

export function RouterTopologyBanner({
  totalProviders,
  connectedProviders,
  totalConnections,
  avgLatencyMs = 94,
}: RouterTopologyBannerProps) {
  return (
    <div className="router-banner">
      {/* Background SVG Grid pattern */}
      <div className="router-banner-bg-grid" />

      <div className="router-banner-content">
        <div className="router-hub-info">
          <div className="router-icon-box">
            <Network className="w-5 h-5 text-accent" />
          </div>

          <div className="router-title-wrap">
            <h2>
              <span>Tern Router Hub</span>
              <span className="router-pulse-indicator">
                <span className="pulse-dot" />
                GATEWAY ONLINE
              </span>
            </h2>
            <p>
              9Router-compatible local routing mesh • Zero-latency failover
              between OAuth, API keys, and custom LLMs.
            </p>
          </div>
        </div>

        {/* Technical Stats Rack */}
        <div className="router-stats-row">
          <div className="router-stat-item">
            <span className="router-stat-label flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 text-accent" />
              Active Routes
            </span>
            <span className="router-stat-val text-green-400">
              {connectedProviders} / {totalProviders} Online
            </span>
          </div>

          <div className="router-stat-item">
            <span className="router-stat-label flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-blue-400" />
              Connection Pools
            </span>
            <span className="router-stat-val">
              {totalConnections}{" "}
              {totalConnections === 1 ? "Account" : "Accounts"}
            </span>
          </div>

          <div className="router-stat-item">
            <span className="router-stat-label flex items-center gap-1">
              <Activity className="w-2.5 h-2.5 text-amber-400" />
              Mesh Latency
            </span>
            <span className="router-stat-val font-mono">
              ~{avgLatencyMs}ms
            </span>
          </div>

          <div className="router-stat-item">
            <span className="router-stat-label flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              Routing Mode
            </span>
            <span className="router-stat-val text-xs text-muted">
              3-Tier Fallback
            </span>
          </div>
        </div>
      </div>

      {/* Decorative Cable Bus Conduit */}
      <svg
        className="cable-bus-svg"
        viewBox="0 0 1000 6"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="3"
          x2="1000"
          y2="3"
          stroke="var(--line-strong)"
          strokeWidth="2"
        />
        <line
          x1="0"
          y1="3"
          x2="280"
          y2="3"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray="4 6"
        />
        <circle cx="280" cy="3" r="3" fill="var(--accent)" />
        <circle cx="520" cy="3" r="3" fill="var(--green)" />
        <circle cx="760" cy="3" r="3" fill="var(--blue)" />
      </svg>
    </div>
  );
}
