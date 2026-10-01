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

const QWEN_MODELS: LocalModel[] = [
  { id: "qwen2.5-coder-32b", name: "Qwen 2.5 Coder 32B (Leading open code)" },
  { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B (Fast local)" },
];

export class QwenCodeAdapter implements LocalProviderAdapter {
  readonly id = "qwen-code";
  readonly name = "Qwen Code";
  readonly category = "cli" as const;
  private activeProcesses = new Map<string, () => void>();

  async detect(): Promise<DetectionResult> {
    const bin = (await findBinary("qwen")) || (await findBinary("qwen-code"));
    if (!bin) return { installed: false };
    const { stdout, code } = await runCommand(bin, ["--version"], 3000);
    return {
      installed: true,
      path: bin,
      version: code === 0 && stdout ? stdout : undefined,
    };
  }

  async authStatus(): Promise<AuthStatus> {
    const det = await this.detect();
    if (!det.installed || !det.path) {
      return { authenticated: false, details: "Qwen CLI not installed" };
    }
    return { authenticated: true, details: "Ready" };
  }

  async listModels(): Promise<LocalModel[]> {
    return QWEN_MODELS;
  }

  async health(): Promise<Health> {
    const start = Date.now();
    const det = await this.detect();
    if (!det.installed || !det.path) {
      return { ok: false, error: "Qwen CLI not installed" };
    }
    const { code } = await runCommand(det.path, ["--version"], 3000);
    return { ok: code === 0, latencyMs: Date.now() - start };
  }

  async *chat(request: ChatRequest): AsyncIterable<StreamEvent> {
    const det = await this.detect();
    if (!det.installed || !det.path) {
      yield { type: "error", error: "Qwen CLI not installed" };
      return;
    }

    const lastMessage =
      request.messages[request.messages.length - 1]?.content || "";

    const { stream, kill } = spawnStreaming(
      det.path,
      ["chat", lastMessage],
      request.signal,
    );
    this.activeProcesses.set(request.id, kill);

    try {
      for await (const chunk of stream) {
        yield { type: "token", token: chunk };
      }
      yield { type: "done" };
    } catch (err: unknown) {
      yield {
        type: "error",
        error: (err as Error)?.message || "Qwen CLI execution failed",
      };
    } finally {
      this.activeProcesses.delete(request.id);
    }
  }

  async cancel(requestId: string): Promise<void> {
    const kill = this.activeProcesses.get(requestId);
    if (kill) {
      kill();
      this.activeProcesses.delete(requestId);
    }
  }

  installGuide(): InstallGuide {
    return {
      command: "pip install qwen-agent",
      url: "https://github.com/QwenLM/Qwen-Agent",
      instructions: "Install Qwen Agent CLI via pip: `pip install qwen-agent`.",
    };
  }
}
