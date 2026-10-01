"use client";

import React from "react";
import { Activity } from "lucide-react";

export function UsageLogsView() {
  const dummyLogs = [
    {
      id: "req-1",
      time: "Just now",
      provider: "Gemini",
      model: "gemini-2.5-flash",
      status: 200,
      tokens: 1420,
      latency: "94ms",
      cost: "$0.00",
    },
    {
      id: "req-2",
      time: "2 mins ago",
      provider: "OpenRouter",
      model: "meta-llama/llama-3.3-70b-instruct",
      status: 200,
      tokens: 2840,
      latency: "142ms",
      cost: "$0.0007",
    },
    {
      id: "req-3",
      time: "15 mins ago",
      provider: "Gemini",
      model: "gemini-2.5-flash",
      status: 429,
      note: "Auto-fallback to OpenRouter",
      tokens: 0,
      latency: "28ms",
      cost: "$0.00",
    },
    {
      id: "req-4",
      time: "1 hr ago",
      provider: "Claude Code",
      model: "claude-3-7-sonnet",
      status: 200,
      tokens: 4210,
      latency: "210ms",
      cost: "OAuth",
    },
  ];

  return (
    <div className="providers-container">
      <header className="providers-header">
        <div className="providers-header-left">
          <h1>
            <Activity className="w-7 h-7 text-accent" />
            Usage & Routing Logs
          </h1>
          <p>
            Monitor live proxy throughput, token savings, endpoint latency, and auto-rotation history.
          </p>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Total Requests</span>
          <span className="text-xl font-bold font-mono text-text mt-1 block">1,842</span>
        </div>
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Tokens Saved (RTK)</span>
          <span className="text-xl font-bold font-mono text-accent mt-1 block">348,200</span>
        </div>
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Failover Rotations</span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">18 Switched</span>
        </div>
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <span className="text-[10px] font-mono text-subtle block uppercase">Uptime Reliability</span>
          <span className="text-xl font-bold font-mono text-green-400 mt-1 block">99.98%</span>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] overflow-hidden">
        <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-text">Recent Router Dispatch Logs</span>
          <span className="text-[10px] font-mono text-muted">Realtime Local Stream</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[var(--panel-2)] text-[10px] text-subtle uppercase border-b border-[var(--line)]">
              <tr>
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-4">Provider</th>
                <th className="py-2.5 px-4">Model</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Tokens</th>
                <th className="py-2.5 px-4">Latency</th>
                <th className="py-2.5 px-4">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] text-muted">
              {dummyLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--panel-2)]">
                  <td className="py-2.5 px-4 text-subtle">{log.time}</td>
                  <td className="py-2.5 px-4 font-semibold text-text">{log.provider}</td>
                  <td className="py-2.5 px-4 text-accent">{log.model}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`conn-status-tag ${
                        log.status === 200
                          ? "connected"
                          : log.status === 429
                            ? "quota_low"
                            : "error"
                      }`}
                    >
                      {log.status === 200 ? "200 OK" : `${log.status} Rotated`}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">{log.tokens.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-green-400">{log.latency}</td>
                  <td className="py-2.5 px-4 text-subtle">{log.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
