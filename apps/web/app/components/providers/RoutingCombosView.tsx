"use client";

import React, { useState } from "react";
import { ArrowDown, GitFork, Layers, Zap } from "lucide-react";

export function RoutingCombosView() {
  const [rtkTokenSaver, setRtkTokenSaver] = useState(true);
  const [cavemanMode, setCavemanMode] = useState(false);

  return (
    <div className="providers-container">
      <header className="providers-header">
        <div className="providers-header-left">
          <h1>
            <GitFork className="w-7 h-7 text-accent" />
            Routing & Fallback Combos
          </h1>
          <p>
            Define multi-tier cascading failovers, RTK token compression, and error recovery pipelines.
          </p>
        </div>
      </header>

      {/* 3-Tier Auto-Fallback Pipeline */}
      <div className="p-6 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-text m-0 flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              Smart 3-Tier Auto-Fallback Pipeline
            </h2>
            <p className="text-xs text-muted m-0 mt-0.5">
              If an endpoint throws a 429 Rate Limit, 503 Overloaded, or invalid quota error, the request automatically transitions down the stack.
            </p>
          </div>
          <span className="conn-status-tag connected">Enabled</span>
        </div>

        <div className="space-y-3">
          {/* Tier 1 */}
          <div className="p-4 rounded-lg border border-accent/40 bg-accent/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-accent text-accent-ink font-mono font-bold text-xs flex items-center justify-center">
                1
              </span>
              <div>
                <strong className="text-xs text-text block">Tier 1: High Capability (Primary)</strong>
                <span className="text-[11px] text-muted">Claude 3.7 Sonnet • Gemini 2.5 Flash / Pro • GPT-4o</span>
              </div>
            </div>
            <span className="card-badge font-mono text-accent">Active Primary</span>
          </div>

          <div className="flex justify-center my-1">
            <ArrowDown className="w-4 h-4 text-subtle" />
          </div>

          {/* Tier 2 */}
          <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-500 text-white font-mono font-bold text-xs flex items-center justify-center">
                2
              </span>
              <div>
                <strong className="text-xs text-text block">Tier 2: High Speed & Low Cost (Secondary)</strong>
                <span className="text-[11px] text-muted">DeepSeek-V3 • Groq Llama 3.3 • OpenRouter Aggregator</span>
              </div>
            </div>
            <span className="card-badge font-mono text-blue-400">On HTTP 429 / 5xx</span>
          </div>

          <div className="flex justify-center my-1">
            <ArrowDown className="w-4 h-4 text-subtle" />
          </div>

          {/* Tier 3 */}
          <div className="p-4 rounded-lg border border-teal-500/30 bg-teal-500/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-500 text-black font-mono font-bold text-xs flex items-center justify-center">
                3
              </span>
              <div>
                <strong className="text-xs text-text block">Tier 3: Free Tier & Community Router (Safety Net)</strong>
                <span className="text-[11px] text-muted">iFlow AI • Qwen 2.5 Coder Free • OpenRouter Free Router</span>
              </div>
            </div>
            <span className="card-badge font-mono text-teal-400">Zero Cost Net</span>
          </div>
        </div>
      </div>

      {/* RTK Token Optimization Settings */}
      <div className="p-6 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)]">
        <h2 className="text-sm font-bold text-text m-0 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          RTK Token Saver & Prompt Optimizer
        </h2>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line)]">
            <input
              type="checkbox"
              checked={rtkTokenSaver}
              onChange={(e) => setRtkTokenSaver(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <div>
              <strong className="text-xs text-text block font-semibold">
                RTK AST & Diff Compression (20% – 40% Token Reduction)
              </strong>
              <p className="text-[11px] text-muted m-0 mt-0.5">
                Automatically minifies compiler logs, AST dumps, and directory scans before transmitting prompts to LLMs.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line)]">
            <input
              type="checkbox"
              checked={cavemanMode}
              onChange={(e) => setCavemanMode(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <div>
              <strong className="text-xs text-text block font-semibold">
                Caveman / Ultra-Concise Response Mode
              </strong>
              <p className="text-[11px] text-muted m-0 mt-0.5">
                Instructs models to skip conversational pleasantries and output only direct, actionable code artifacts.
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
