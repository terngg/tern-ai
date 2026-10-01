export interface DetectionResult {
  installed: boolean;
  version?: string | undefined;
  path?: string | undefined;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: string | undefined;
  details?: string | undefined;
}

export interface Health {
  ok: boolean;
  latencyMs?: number | undefined;
  error?: string | undefined;
}

export interface LocalModel {
  id: string;
  name: string;
  contextWindow?: number | undefined;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  id: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface StreamEvent {
  type: "token" | "done" | "error";
  token?: string | undefined;
  error?: string | undefined;
}

export interface InstallGuide {
  command?: string | undefined;
  url?: string | undefined;
  instructions: string;
}

export interface DetectedLocalProvider {
  id: string;
  name: string;
  installed: boolean;
  version?: string | undefined;
  authenticated: boolean;
  authDetails?: string | undefined;
  models: Array<{
    id: string;
    name: string;
    contextWindow?: number | undefined;
    source: "discovered" | "configured";
  }>;
  health: { ok: boolean; latencyMs?: number | undefined; error?: string | undefined };
}

export interface LocalProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly category: "cli" | "daemon" | "agent";
  detect(): Promise<DetectionResult>;
  authStatus(): Promise<AuthStatus>;
  listModels(): Promise<LocalModel[]>;
  health(): Promise<Health>;
  chat(request: ChatRequest): AsyncIterable<StreamEvent>;
  cancel(requestId: string): Promise<void>;
  installGuide?(): InstallGuide;
}
