import React from "react";
import type { Connection, ProviderDefinition } from "../../../lib/router/types";
import { getProviderColor } from "./providerColors";
import { Badge } from "../ui/Badge";
import { ProviderIcon } from "../ui/ProviderIcon";
import { connectionStatus } from "../providers/RouterDashboard";

interface ProviderCardProps {
  provider: ProviderDefinition;
  connections: Connection[];
  onClick: () => void;
  onToggle?: (enabled: boolean) => void;
}

export function ProviderCard({
  provider,
  connections,
  onClick,
  onToggle,
}: ProviderCardProps) {
  const brandColor = getProviderColor(provider.id);
  const accounts = connections.filter((c) => c.provider === provider.id);
  const hasAccounts = accounts.length > 0;
  const allDisabled = hasAccounts && accounts.every((c) => !c.enabled);
  const connectedCount = accounts.filter(
    (c) => c.enabled && ["connected", "healthy"].includes(c.health),
  ).length;
  const errorCount = accounts.filter(
    (c) =>
      c.enabled &&
      [
        "auth_failure",
        "permission_denied",
        "rate_limit",
        "quota_exhausted",
        "server_error",
        "network",
      ].includes(c.health),
  ).length;

  // Status string required by tests:
  // "Requires Tern Companion", "Unsupported", "Not configured", or "X connection(s)"
  let statusText = "Not configured";
  if (provider.adapterStatus === "requires_companion") {
    statusText = "Requires Tern Companion";
  } else if (provider.adapterStatus === "unsupported") {
    statusText = "Unsupported";
  } else if (hasAccounts) {
    statusText = `${accounts.length} connection${accounts.length === 1 ? "" : "s"}`;
  }

  return (
    <button
      type="button"
      className={`provider-card real-provider-card group text-left w-full p-3 rounded-[12px] bg-surface border border-border-subtle hover:border-primary/40 hover:bg-surface-2/40 transition-all cursor-pointer flex flex-col justify-between min-h-[96px] ${
        allDisabled ? "opacity-60" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2.5 w-full">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className="size-8 rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
            style={{
              backgroundColor: `${brandColor}15`,
              border: `1px solid ${brandColor}30`,
            }}
          >
            <ProviderIcon
              providerId={provider.id}
              alt={provider.name}
              size={24}
              className="max-w-[24px] max-h-[24px]"
              fallbackText={provider.name.slice(0, 2)}
              fallbackColor={brandColor === "#ededed" ? "#ffffff" : brandColor}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-text-main font-semibold text-[13px] truncate leading-snug">
              {provider.name}
            </h3>
            <div className="text-[11px] text-text-muted truncate mt-0.5">
              {statusText}
            </div>
          </div>
        </div>

        {hasAccounts && onToggle && (
          <div
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!allDisabled);
            }}
          >
            <span
              className={`size-2 rounded-full inline-block ${
                allDisabled ? "bg-gray-500" : "bg-green-500"
              }`}
              title={allDisabled ? "Disabled" : "Active"}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-text-subtle pt-2 border-t border-border-subtle/50 mt-2 w-full">
        <span className="truncate">
          {provider.adapterStatus === "implemented"
            ? "Chat · Streaming"
            : provider.auth === "local_companion"
              ? "Companion"
              : "No adapter"}
        </span>

        {hasAccounts && (
          <div className="shrink-0 flex items-center gap-1.5 ml-2">
            {accounts.length === 1 ? (
              <Badge
                variant={
                  ["Connected", "Healthy"].includes(connectionStatus(accounts[0]!))
                    ? "success"
                    : connectionStatus(accounts[0]!) === "Disabled"
                      ? "default"
                      : "error"
                }
                size="sm"
                dot
              >
                {connectionStatus(accounts[0]!)}
              </Badge>
            ) : connectedCount > 0 ? (
              <Badge variant="success" size="sm" dot>
                {connectedCount} connected
              </Badge>
            ) : errorCount > 0 ? (
              <Badge variant="error" size="sm" dot>
                {errorCount} errors
              </Badge>
            ) : (
              <Badge variant="default" size="sm">
                {accounts.length} accounts
              </Badge>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
