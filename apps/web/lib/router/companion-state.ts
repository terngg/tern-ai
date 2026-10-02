import type { Connection, DetectedLocalProvider } from "./types.js";
import { canonicalModel } from "./model-selection.js";

// Leaves room for cleanup before the 105s request / 120s Vercel deadlines.
export const COMPANION_TIMEOUT_MS = 90_000;

export function companionState(
  detected: DetectedLocalProvider,
  current?: Connection,
  now = Date.now(),
): Partial<Connection> {
  const models = detected.models.length ? detected.models : current?.models || [];
  const cooling = !!current?.cooldownUntil && current.cooldownUntil > now;
  // A local readiness check is not evidence that upstream quota or access recovered.
  const blocked = current?.quota === "exhausted" ||
    current?.health === "permission_denied" || cooling;
  return {
    model: canonicalModel(detected.id, current?.model || models[0]?.id || "", models),
    models,
    modelsAt: detected.models.length ? now : current?.modelsAt ?? null,
    health: !detected.authenticated ? "auth_failure"
      : !detected.health.ok ? "network"
      : blocked ? current!.health : "connected",
    checkedAt: now,
    latencyMs: detected.health.latencyMs ?? null,
    cooldownUntil: cooling ? current!.cooldownUntil : null,
    // Upgrade the former automatic 60s default; retain other configured limits.
    timeoutMs: !current || current.timeoutMs === 60_000
      ? COMPANION_TIMEOUT_MS : current.timeoutMs,
  };
}
