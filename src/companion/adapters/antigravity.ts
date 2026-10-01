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
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGY_MODELS: LocalModel[] = [
  { id: "antigravity-flash", name: "Antigravity Flash (Fast)" },
  { id: "antigravity-pro", name: "Antigravity Pro (Deep reasoning)" },
];

export class AntigravityAdapter implements LocalProviderAdapter {
  readonly id = "antigravity";
  readonly name = "Antigravity";
  readonly category = "cli" as const;
  private activeProcesses = new Map<string, () => void>();

  async detect(): Promise<DetectionResult> {
    const bin = (await findBinary("agy")) || (await findBinary("antigravity"));
    const dir = join(homedir(), ".gemini", "antigravity-cli");
    if (bin) {
      const { stdout, code } = await runCommand(bin, ["--version"], 3000);
      return {
        installed: true,
        path: bin,
        version: code === 0 && stdout ? stdout : undefined,
      };
    }
    if (existsSync(dir)) {
      return { installed: true, path: dir, version: "2.0" };
    }
    return { installed: false };
  }

  async authStatus(): Promise<AuthStatus> {
    const det = await this.detect();
    if (!det.installed) {
      return { authenticated: false, details: "Antigravity CLI not installed" };
    }
    const dir = join(homedir(), ".gemini", "antigravity-cli");
    if (existsSync(dir)) {
      return {
        authenticated: true,
        details: "Authenticated via local Antigravity environment",
      };
    }
    return { authenticated: true, details: "Ready" };
  }

  async listModels(): Promise<LocalModel[]> {
    return AGY_MODELS;
  }

  async health(): Promise<Health> {
    const start = Date.now();
    const det = await this.detect();
    if (!det.installed) {
      return { ok: false, error: "Antigravity not found" };
    }
    return { ok: true, latencyMs: Date.now() - start };
  }

  async *chat(request: ChatRequest): AsyncIterable<StreamEvent> {
    const det = await this.detect();
    if (!det.installed || !det.path) {
      yield { type: "error", error: "Antigravity CLI not installed" };
      return;
    }

    const lastMessage =
      request.messages[request.messages.length - 1]?.content || "";

    const { stream, kill } = spawnStreaming(
      det.path,
      ["run", lastMessage],
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
        error: (err as Error)?.message || "Antigravity execution failed",
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
      command: "curl -fsSL https://antigravity.google/install.sh | sh",
      url: "https://antigravity.google",
      instructions: "Install Antigravity CLI to enable local execution.",
    };
  }
}
