"use client";

import React, { useState } from "react";
import { getProviderColor } from "../dashboard/providerColors";

const ICON_ALIASES: Record<string, string> = {
  "claude-code": "claude",
  "qwen-code": "qwen",
  "kilo-code": "kilocode",
  "openai-compatible": "openai",
  "anthropic-compatible": "anthropic",
  "perplexity-agent": "perplexity",
  "gitlab-duo": "gitlab",
  "vercel-ai-gateway": "vercel",
  "ollama-search": "ollama",
};

// In-memory failed IDs cache so 404s aren't retried repeatedly
const failedIds = new Set<string>();

export function resolveProviderIconId(providerId: string): string {
  if (!providerId) return "";
  const id = providerId.trim().toLowerCase();
  if (failedIds.has(id)) return "";
  const aliased = ICON_ALIASES[id] || id;
  if (failedIds.has(aliased)) return "";
  return aliased;
}

export function getProviderIconSrc(providerId: string): string | null {
  const id = resolveProviderIconId(providerId);
  return id ? `/providers/${id}.png` : null;
}

export function markProviderIconMissing(providerId: string) {
  if (!providerId) return;
  const id = providerId.trim().toLowerCase();
  failedIds.add(id);
  const aliased = ICON_ALIASES[id];
  if (aliased) failedIds.add(aliased);
}

export interface ProviderIconProps {
  providerId?: string;
  src?: string;
  alt?: string;
  size?: number;
  className?: string;
  fallbackText?: string;
  fallbackColor?: string;
}

export function ProviderIcon({
  providerId = "",
  src,
  alt = "",
  size = 24,
  className = "",
  fallbackText,
  fallbackColor,
}: ProviderIconProps) {
  const effectiveSrc = src || (providerId ? getProviderIconSrc(providerId) : null);
  const [errored, setErrored] = useState(false);

  const fallbackInitial =
    fallbackText || (providerId ? providerId.slice(0, 2).toUpperCase() : "?");
  const brandColor = fallbackColor || getProviderColor(providerId);

  if (!effectiveSrc || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold font-mono rounded select-none shrink-0 ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: brandColor === "#ededed" ? "#ffffff" : brandColor,
          fontSize: Math.max(9, Math.floor(size * 0.42)),
        }}
        aria-hidden="true"
      >
        {fallbackInitial}
      </span>
    );
  }

  return (
    <img
      src={effectiveSrc}
      alt={alt || `${providerId} logo`}
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`.trim()}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}
    />
  );
}

export default ProviderIcon;
