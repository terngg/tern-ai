import type {
  LocalProviderAdapter,
  DetectionResult,
  AuthStatus,
  Health,
  LocalModel,
  ChatRequest,
  StreamEvent,
  InstallGuide,
} from "../types.js";
import { findBinary, runCommand, spawnStreaming } from "./base.js";

function createGenericAdapter(
  id: string,
  name: string,
  binaryNames: string[],
  models: LocalModel[],
  installCommand: string,
  docUrl: string,
): LocalProviderAdapter {
  const activeProcesses = new Map<string, () => void>();

  return {
    id,
    name,
    category: "cli",
    async detect(): Promise<DetectionResult> {
      for (const name of binaryNames) {
        const bin = await findBinary(name);
        if (bin) {
          const { stdout, code } = await runCommand(bin, ["--version"], 3000);
          return {
            installed: true,
            path: bin,
            version: code === 0 && stdout ? stdout : undefined,
          };
        }
      }
      return { installed: false };
    },
    async authStatus(): Promise<AuthStatus> {
      const det = await this.detect();
      if (!det.installed) {
        return { authenticated: false, details: `${name} is not installed` };
      }
      return { authenticated: true, details: "Ready" };
    },
    async listModels(): Promise<LocalModel[]> {
      return models;
    },
    async health(): Promise<Health> {
      const start = Date.now();
      const det = await this.detect();
      if (!det.installed) {
        return { ok: false, error: `${name} not installed` };
      }
      return { ok: true, latencyMs: Date.now() - start };
    },
    async *chat(request: ChatRequest): AsyncIterable<StreamEvent> {
      const det = await this.detect();
      if (!det.installed || !det.path) {
        yield { type: "error", error: `${name} not installed` };
        return;
      }
      const lastMessage =
        request.messages[request.messages.length - 1]?.content || "";
      const { stream, kill } = spawnStreaming(
        det.path,
        ["prompt", lastMessage],
        request.signal,
      );
      activeProcesses.set(request.id, kill);

      try {
        for await (const chunk of stream) {
          yield { type: "token", token: chunk };
        }
        yield { type: "done" };
      } catch (err: unknown) {
        yield {
          type: "error",
          error: (err as Error)?.message || `${name} execution failed`,
        };
      } finally {
        activeProcesses.delete(request.id);
      }
    },
    async cancel(requestId: string): Promise<void> {
      const kill = activeProcesses.get(requestId);
      if (kill) {
        kill();
        activeProcesses.delete(requestId);
      }
    },
    installGuide(): InstallGuide {
      return {
        command: installCommand,
        url: docUrl,
        instructions: `Install ${name} via \`${installCommand}\` or visit ${docUrl}.`,
      };
    },
  };
}

export class ClineAdapter implements LocalProviderAdapter {
  private inner = createGenericAdapter(
    "cline",
    "Cline",
    ["cline"],
    [
      { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (Cline)" },
      { id: "gpt-4o", name: "GPT-4o (Cline)" },
    ],
    "npm install -g cline",
    "https://github.com/cline/cline",
  );
  readonly id = "cline";
  readonly name = "Cline";
  readonly category = "cli" as const;
  detect = () => this.inner.detect();
  authStatus = () => this.inner.authStatus();
  listModels = () => this.inner.listModels();
  health = () => this.inner.health();
  chat = (r: ChatRequest) => this.inner.chat(r);
  cancel = (id: string) => this.inner.cancel(id);
  installGuide = () => this.inner.installGuide!();
}

export class KiloCodeAdapter implements LocalProviderAdapter {
  private inner = createGenericAdapter(
    "kilo-code",
    "Kilo Code",
    ["kilo", "kilo-code"],
    [{ id: "kilo-default", name: "Kilo Code Default" }],
    "npm install -g kilo-code",
    "https://kilo.ai",
  );
  readonly id = "kilo-code";
  readonly name = "Kilo Code";
  readonly category = "cli" as const;
  detect = () => this.inner.detect();
  authStatus = () => this.inner.authStatus();
  listModels = () => this.inner.listModels();
  health = () => this.inner.health();
  chat = (r: ChatRequest) => this.inner.chat(r);
  cancel = (id: string) => this.inner.cancel(id);
  installGuide = () => this.inner.installGuide!();
}

export class CursorAdapter implements LocalProviderAdapter {
  private inner = createGenericAdapter(
    "cursor",
    "Cursor",
    ["cursor", "cursor-cli"],
    [
      { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (Cursor)" },
      { id: "cursor-small", name: "Cursor Small" },
    ],
    "curl -fsSL https://cursor.com/install.sh | sh",
    "https://cursor.com",
  );
  readonly id = "cursor";
  readonly name = "Cursor";
  readonly category = "cli" as const;
  detect = () => this.inner.detect();
  authStatus = () => this.inner.authStatus();
  listModels = () => this.inner.listModels();
  health = () => this.inner.health();
  chat = (r: ChatRequest) => this.inner.chat(r);
  cancel = (id: string) => this.inner.cancel(id);
  installGuide = () => this.inner.installGuide!();
}

export class CopilotAdapter implements LocalProviderAdapter {
  private inner = createGenericAdapter(
    "copilot",
    "Copilot",
    ["gh-copilot", "copilot"],
    [
      { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (Copilot)" },
      { id: "gpt-4o", name: "GPT-4o (Copilot)" },
    ],
    "gh extension install github/gh-copilot",
    "https://docs.github.com/copilot",
  );
  readonly id = "copilot";
  readonly name = "Copilot";
  readonly category = "cli" as const;
  detect = () => this.inner.detect();
  authStatus = () => this.inner.authStatus();
  listModels = () => this.inner.listModels();
  health = () => this.inner.health();
  chat = (r: ChatRequest) => this.inner.chat(r);
  cancel = (id: string) => this.inner.cancel(id);
  installGuide = () => this.inner.installGuide!();
}
