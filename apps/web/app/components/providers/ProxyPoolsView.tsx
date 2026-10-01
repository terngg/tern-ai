"use client";

import React, { useState } from "react";
import { Network, Server } from "lucide-react";

export function ProxyPoolsView() {
  const [pools] = useState([
    {
      id: "pool-code-primary",
      name: "Primary Coding Pool",
      algorithm: "Priority Failover",
      healthy: true,
      routes: 4,
      avgLatency: 92,
      successRate: "99.8%",
      targets: ["Claude 3.7 Sonnet", "Gemini 2.5 Flash", "DeepSeek-V3", "OpenRouter"],
    },
    {
      id: "pool-fast-lpu",
      name: "Ultra-Fast Inference Pool",
      algorithm: "Lowest Latency",
      healthy: true,
      routes: 3,
      avgLatency: 38,
      successRate: "99.9%",
      targets: ["Groq Llama 3.3", "Cerebras CS-3", "Together Fast"],
    },
    {
      id: "pool-free-tier",
      name: "Zero-Cost Fallback Pool",
      algorithm: "Round Robin",
      healthy: true,
      routes: 4,
      avgLatency: 145,
      successRate: "97.4%",
      targets: ["OpenRouter Free", "iFlow AI", "Qwen Code", "Gemini CLI"],
    },
  ]);

  return (
    <div className="providers-container">
      <header className="providers-header">
        <div className="providers-header-left">
          <h1>
            <Network className="w-7 h-7 text-accent" />
            Proxy Pools
          </h1>
          <p>
            Configure load balancing, automatic failover groups, and health-check policies across AI providers.
          </p>
        </div>
      </header>

      {/* Pool Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Total Pools</span>
          <span className="text-xl font-bold font-mono text-text mt-1 block">3 Active Pools</span>
        </div>
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Health Checks</span>
          <span className="text-xl font-bold font-mono text-green-400 mt-1 block">All Endpoints Healthy</span>
        </div>
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Failover Target</span>
          <span className="text-xl font-bold font-mono text-accent mt-1 block">Zero Downtime</span>
        </div>
      </div>

      {/* Pools Grid */}
      <div className="space-y-4">
        {pools.map((pool) => (
          <div
            key={pool.id}
            className="p-5 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] hover:border-accent/40 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 text-accent flex items-center justify-center font-bold">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text m-0 flex items-center gap-2">
                    {pool.name}
                    <span className="conn-status-tag connected">Active</span>
                  </h3>
                  <p className="text-xs text-muted m-0 mt-0.5">
                    Algorithm: <span className="font-mono text-text">{pool.algorithm}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-subtle">Latency:</span>{" "}
                  <span className="text-green-400 font-bold">{pool.avgLatency}ms</span>
                </div>
                <div>
                  <span className="text-subtle">Success:</span>{" "}
                  <span className="text-text font-bold">{pool.successRate}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono text-subtle uppercase mr-1">Pool Routes:</span>
              {pool.targets.map((target, idx) => (
                <span key={idx} className="card-badge font-mono text-[10px] py-1 px-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block mr-1.5" />
                  {target}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
