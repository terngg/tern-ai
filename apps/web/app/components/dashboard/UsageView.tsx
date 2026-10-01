import React from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import type { Connection, Trace } from "../../../lib/router/types";
import { RequestsTable } from "./RequestsTable";

interface UsageViewProps {
  traces: Trace[];
  connections: Connection[];
}

export function UsageView({ traces, connections }: UsageViewProps) {
  const totalRequests = traces.length;
  const successfulRequests = traces.filter((t) => t.status === "ok").length;
  const failedRequests = traces.filter((t) => t.status === "error").length;

  const totalInputTokens = traces
    .filter((t) => t.inputTokens !== null)
    .reduce((sum, t) => sum + (t.inputTokens || 0), 0);

  const totalOutputTokens = traces
    .filter((t) => t.outputTokens !== null)
    .reduce((sum, t) => sum + (t.outputTokens || 0), 0);

  const missingTokenCount = traces.filter(
    (t) => t.inputTokens === null || t.outputTokens === null,
  ).length;

  const successRate =
    totalRequests > 0
      ? Math.round((successfulRequests / totalRequests) * 100)
      : null;

  return (
    <div className="space-y-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Requests</span>
            <Activity size={16} className="text-text-subtle" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main font-mono">
              {totalRequests}
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              {successfulRequests} ok · {failedRequests} err
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Input Tokens</span>
            <ArrowDownLeft size={16} className="text-blue-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main font-mono">
              {totalInputTokens.toLocaleString()}
            </div>
            <div className="text-[11px] text-text-muted mt-1">Prompt tokens</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Output Tokens</span>
            <ArrowUpRight size={16} className="text-green-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main font-mono">
              {totalOutputTokens.toLocaleString()}
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              Completion tokens
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Success Rate</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main font-mono">
              {successRate !== null ? `${successRate}%` : "—"}
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              {failedRequests === 0
                ? "No failures"
                : `${failedRequests} failed attempt${failedRequests === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
      </div>

      {/* Honest token accounting note */}
      <div className="p-4 rounded-xl border border-border-subtle bg-surface text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
        <span>
          Showing reported token metrics for the latest {traces.length}{" "}
          recorded requests.
        </span>
        {missingTokenCount > 0 && (
          <span className="text-text-subtle">
            {missingTokenCount} requests have missing provider token data and are
            not estimated.
          </span>
        )}
      </div>

      {/* Recent Requests Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-main">
          Recent Request Traces
        </h3>
        <RequestsTable traces={traces} connections={connections} />
      </div>
    </div>
  );
}
