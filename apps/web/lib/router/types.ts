export type Protocol = "openai" | "anthropic";
export type Strategy =
  "round_robin" | "least_recently_used" | "priority" | "health_aware";
export type ErrorCategory =
  | "rate_limit"
  | "quota_exhausted"
  | "auth_failure"
  | "timeout"
  | "stream_interrupted"
  | "provider_overload"
  | "server_error"
  | "bad_request"
  | "permission_denied"
  | "network"
  | "cancelled";
export type ExecutionMode =
  | "cloud_api"
  | "cloud_oauth"
  | "companion"
  | "unsupported";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: "oauth" | "free" | "api_key" | "compatible" | "local";
  auth: "api_key" | "oauth" | "device_code" | "local_companion" | "custom";
  executionMode: ExecutionMode;
  capabilities: {
    chat?: boolean;
    code?: boolean;
    vision?: boolean;
    tools?: boolean;
    embeddings?: boolean;
    images?: boolean;
  };
  adapterStatus: "implemented" | "requires_companion" | "unsupported";
  protocol?: Protocol;
  baseUrl?: string;
  docs?: string;
}

export interface DetectedLocalProvider {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  authenticated: boolean;
  authDetails?: string;
  models: Model[];
  health: { ok: boolean; latencyMs?: number; error?: string };
}

export interface CompanionStatus {
  paired: boolean;
  connected: boolean;
  companionId?: string;
  platform?: string;
  label?: string;
  lastHeartbeat?: number;
  detectedProviders: DetectedLocalProvider[];
}
export interface Model {
  id: string;
  name: string;
  contextWindow?: number;
  inputPrice?: number;
  outputPrice?: number;
  source: "discovered" | "configured";
}
export interface Connection {
  id: string;
  provider: string;
  label: string;
  enabled: boolean;
  priority: number;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  models: Model[];
  modelsAt: number | null;
  health: "unknown" | "connected" | "healthy" | ErrorCategory;
  checkedAt: number | null;
  latencyMs: number | null;
  cooldownUntil: number | null;
  lastUsed: number | null;
  quota: "unknown" | "exhausted";
  maskedCredential: string;
  hasCredential: boolean;
}
export interface Secret {
  key: string;
  authHeader: string;
  authPrefix: string;
  headers: Record<string, string>;
}
export interface PoolConfig {
  id: string;
  name: string;
  connections: string[];
  strategy: Strategy;
  enabled: boolean;
}
export interface Trace {
  id: string;
  timestamp: number;
  requestedModel: string;
  selectedModel: string;
  provider: string;
  connectionId: string;
  routingMode: string;
  retries: number;
  fallbackPath: string[];
  latencyMs: number;
  ttftMs: number | null;
  status: "ok" | "error";
  errorCategory: ErrorCategory | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
}
