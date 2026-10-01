import React from "react";
import type { Connection } from "../../../lib/router/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { ProviderIcon } from "../ui/ProviderIcon";
import { getProviderColor } from "./providerColors";

interface QuotaViewProps {
  connections: Connection[];
}

export function QuotaView({ connections }: QuotaViewProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border-subtle bg-surface">
        <h3 className="text-sm font-semibold text-text-main">
          Account Quota & Rate Limit State
        </h3>
        <p className="text-xs text-text-muted mt-0.5">
          Real quota reports from upstream providers. Remaining percentages are
          never estimated without upstream evidence.
        </p>
      </div>

      {!connections.length ? (
        <EmptyState
          title="No configured accounts"
          description="Quota and rate limit tracking will populate as provider accounts are configured and invoked."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {connections.map((c) => {
            const isExhausted = c.quota === "exhausted";
            const isCooldown = c.cooldownUntil && c.cooldownUntil > Date.now();
            const brandColor = getProviderColor(c.provider);

            return (
              <div
                key={c.id}
                className="router-panel p-4 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="size-7 rounded-md shrink-0 flex items-center justify-center overflow-hidden"
                      style={{
                        backgroundColor: `${brandColor}18`,
                        border: `1px solid ${brandColor}30`,
                      }}
                    >
                      <ProviderIcon
                        providerId={c.provider}
                        alt={c.provider}
                        size={20}
                        className="max-w-[20px] max-h-[20px]"
                        fallbackText={c.provider.slice(0, 2)}
                        fallbackColor={
                          brandColor === "#ededed" ? "#ffffff" : brandColor
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-text-main font-semibold text-xs truncate">
                        {c.label}
                      </h4>
                      <span className="text-[11px] text-text-subtle font-mono">
                        {c.provider}
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant={
                      !c.enabled
                        ? "default"
                        : isExhausted
                          ? "error"
                          : isCooldown
                            ? "warning"
                            : "success"
                    }
                    size="sm"
                    dot
                  >
                    {!c.enabled
                      ? "Disabled"
                      : isExhausted
                        ? "Quota exhausted"
                        : isCooldown
                          ? "Cooldown"
                          : "Active"}
                  </Badge>
                </div>

                <div className="text-[11px] text-text-muted space-y-1 pt-2 border-t border-border-subtle/50">
                  <div className="flex items-center justify-between">
                    <span>Remaining Quota</span>
                    <span className="font-medium text-text-main">
                      {isExhausted ? "0 (exhausted)" : "Unknown"}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-subtle">
                    No remaining percentage is available from this integration.
                  </p>

                  {isCooldown && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px]">
                      Cooldown until{" "}
                      {new Date(c.cooldownUntil!).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
