import { randomUUID } from "node:crypto";
import { PublicError } from "./errors.js";
import { providerById } from "./registry.js";
import { resolveTarget } from "./transport.js";
import type { Connection, PoolConfig, Secret, Strategy } from "./types.js";
import { RouterStore } from "./store.js";
export function textField(value: unknown, name: string, max = 200): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new PublicError(`Invalid ${name}.`);
  return value.trim();
}
function model(value: unknown): string {
  const id = textField(value, "model", 200);
  if (!/^[\w.:/+-]+$/.test(id)) throw new PublicError("Invalid model ID.");
  return id;
}
const forbiddenHeader =
  /^(host|cookie|set-cookie|connection|content-length|transfer-encoding|upgrade|proxy-.*|forwarded|x-forwarded-.*|x-vercel-.*|content-type|accept-encoding)$/i;
export function validateHeaders(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PublicError("Custom headers must be a JSON object.");
  const result: Record<string, string> = {};
  if (Object.keys(value).length > 16)
    throw new PublicError("Too many custom headers.");
  for (const [k, v] of Object.entries(value)) {
    if (
      !/^[A-Za-z0-9-]{1,80}$/.test(k) ||
      forbiddenHeader.test(k) ||
      typeof v !== "string" ||
      v.length > 4096 ||
      /[^\x20-\x7e]/.test(v)
    )
      throw new PublicError("Invalid custom header.");
    result[k.toLowerCase()] = v;
  }
  return result;
}
export async function createConnection(
  store: RouterStore,
  input: Record<string, unknown>,
): Promise<Connection> {
  const provider = providerById(String(input.provider));
  if (!provider || provider.adapterStatus !== "implemented")
    throw new PublicError("This provider is not implemented for Vercel.");
  const custom = provider.category === "compatible";
  const baseUrl =
    provider.baseUrl || textField(input.baseUrl, "base URL", 2048);
  await resolveTarget(baseUrl);
  const key = textField(input.key, "API key", 4096);
  if (/\s/.test(key) || key.length < 8)
    throw new PublicError("Invalid API key.");
  const authHeader =
    custom && input.authHeader
      ? textField(input.authHeader, "auth header", 80)
      : provider.protocol === "anthropic"
        ? "x-api-key"
        : "Authorization";
  validateHeaders({ [authHeader]: "validation" });
  const authPrefix =
    custom && typeof input.authPrefix === "string"
      ? input.authPrefix
      : provider.protocol === "anthropic"
        ? ""
        : "Bearer ";
  if (authPrefix.length > 40 || /[^\x20-\x7e]/.test(authPrefix))
    throw new PublicError("Invalid auth prefix.");
  const secret: Secret = {
    key,
    authHeader: authHeader.toLowerCase(),
    authPrefix,
    headers: custom ? validateHeaders(input.headers) : {},
  };
  const models = Array.isArray(input.models)
    ? input.models.slice(0, 100).map((value) => ({
        id: model(value),
        name: model(value),
        source: "configured" as const,
      }))
    : [];
  const selected = input.model ? model(input.model) : "";
  if (selected && !models.some((m) => m.id === selected))
    models.push({ id: selected, name: selected, source: "configured" });
  const timeoutMs =
    input.timeoutMs === undefined ? 60_000 : Number(input.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 100_000)
    throw new PublicError("Timeout must be 1000–100000 ms.");
  return store.create(
    {
      provider: provider.id,
      label: textField(input.label, "label", 80),
      enabled: input.enabled !== false,
      priority: 0,
      model: selected,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      timeoutMs,
      models,
      modelsAt: null,
      health: "unknown",
      checkedAt: null,
      latencyMs: null,
      cooldownUntil: null,
      lastUsed: null,
      quota: "unknown",
      maskedCredential: "••••" + key.slice(-4),
      hasCredential: true,
    },
    secret,
  );
}
export async function updateConnection(
  store: RouterStore,
  input: Record<string, unknown>,
): Promise<void> {
  const id = textField(input.id, "connection");
  await store.connection(id);
  const patch: Partial<Connection> = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean")
      throw new PublicError("Invalid enabled state.");
    patch.enabled = input.enabled;
  }
  if (input.label !== undefined)
    patch.label = textField(input.label, "label", 80);
  if (input.model !== undefined) patch.model = model(input.model);
  if (input.priority !== undefined) {
    if (
      !Number.isInteger(input.priority) ||
      Number(input.priority) < 0 ||
      Number(input.priority) > 1000
    )
      throw new PublicError("Invalid priority.");
    patch.priority = Number(input.priority);
  }
  await store.patch(id, patch);
}
export async function savePool(
  store: RouterStore,
  input: Record<string, unknown>,
): Promise<void> {
  const strategies: Strategy[] = [
    "round_robin",
    "least_recently_used",
    "priority",
    "health_aware",
  ];
  if (
    !strategies.includes(input.strategy as Strategy) ||
    !Array.isArray(input.connections) ||
    !input.connections.length ||
    input.connections.length > 100 ||
    new Set(input.connections).size !== input.connections.length
  )
    throw new PublicError("Choose a strategy and distinct connections.");
  const config: PoolConfig = {
    id: input.id ? textField(input.id, "pool") : randomUUID(),
    name: textField(input.name, "pool name", 80),
    strategy: input.strategy as Strategy,
    connections: input.connections.map((v) => textField(v, "connection")),
    enabled: input.enabled !== false,
  };
  await store.savePool(config);
}
