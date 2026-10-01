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

const CODEX_MODELS: LocalModel[] = [
  { id: "o3-mini", name: "o3-mini (High reasoning)" },
  { id: "o1", name: "o1 (Reasoning)" },
  { id: "gpt-4o", name: "GPT-4o (Omni multimodal)" },
  { id: "gpt-4o-mini", name: "GPT-4o-mini (Fast & efficient)" },
];

export class CodexAdapter implements LocalProviderAdapter {
  readonly id = "codex";
  readonly name = "Codex CLI";
  readonly category = "cli" as const;
  private activeProcesses = new Map<string, () => void>();

  async detect(): Promise<DetectionResult> {
    const bin = (await findBinary("codex")) || (await findBinary("codex-cli"));
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
      return { authenticated: false, details: "Codex CLI not installed" };
    }

    // Check config directory ~/.codex
    const configDir = join(homedir(), ".codex");
    const hasConfig =
      existsSync(configDir) || existsSync(join(configDir, "config.json"));

    // Check CLI status command
    const { stdout, code } = await runCommand(
      det.path,
      ["auth", "status"],
      4000,
    );
    if (code === 0 && !stdout.toLowerCase().includes("not logged in")) {
      return {
        authenticated: true,
        details: stdout || "Authenticated",
      };
    }

    if (hasConfig) {
      return {
        authenticated: true,
        details: "Config found in ~/.codex",
      };
    }

    return {
      authenticated: false,
      details: "Not logged in. Run `codex login`",
    };
  }

  async listModels(): Promise<LocalModel[]> {
    const det = await this.detect();
    if (!det.installed || !det.path) return CODEX_MODELS;
    try {
      const { stdout, code } = await runCommand(
        det.path,
        ["models", "list"],
        4000,
      );
      if (code === 0 && stdout) {
        const lines = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        if (lines.length > 0) {
          return lines.map((id) => ({ id, name: id }));
        }
      }
    } catch {
      /* fallback */
    }
    return CODEX_MODELS;
  }

  async health(): Promise<Health> {
    const start = Date.now();
    const det = await this.detect();
    if (!det.installed || !det.path) {
      return { ok: false, error: "Codex CLI is not installed" };
    }
    const { code, stderr } = await runCommand(det.path, ["--version"], 3000);
    const latency = Date.now() - start;
    if (code === 0) {
      return { ok: true, latencyMs: latency };
    }
    return {
      ok: false,
      latencyMs: latency,
      error: stderr || `Exit code ${code}`,
    };
  }

  async *chat(request: ChatRequest): AsyncIterable<StreamEvent> {
    const det = await this.detect();
    if (!det.installed || !det.path) {
      yield { type: "error", error: "Codex CLI not installed" };
      return;
    }

    const lastMessage =
      request.messages[request.messages.length - 1]?.content || "";
    const systemPrompt = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${lastMessage}`
      : lastMessage;

    const args = [
      "exec",
      "--model",
      request.model || "o3-mini",
      "--prompt",
      fullPrompt,
    ];

    const { stream, kill } = spawnStreaming(det.path, args, request.signal);
    this.activeProcesses.set(request.id, kill);

    try {
      for await (const chunk of stream) {
        yield { type: "token", token: chunk };
      }
      yield { type: "done" };
    } catch (err: unknown) {
      yield {
        type: "error",
        error: (err as Error)?.message || "Codex CLI execution failed",
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
      command: "npm install -g @openai/codex",
      url: "https://github.com/openai/codex",
      instructions:
        "Install Codex CLI using npm or your package manager, then run `codex login` to authenticate.",
    };
  }
}
