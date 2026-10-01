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

const KIRO_MODELS: LocalModel[] = [
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (via Kiro)" },
  { id: "kiro-code-v1", name: "Kiro Code v1" },
  { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet (via Kiro)" },
];

export class KiroAdapter implements LocalProviderAdapter {
  readonly id = "kiro";
  readonly name = "Kiro";
  readonly category = "cli" as const;
  private activeProcesses = new Map<string, () => void>();

  async detect(): Promise<DetectionResult> {
    const bin = (await findBinary("kiro-cli")) || (await findBinary("kiro"));
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
      return { authenticated: false, details: "Kiro CLI not installed" };
    }

    // Check ~/.kiro configuration directory and AWS SSO credentials
    const kiroDir = join(homedir(), ".kiro");
    const awsSsoDir = join(homedir(), ".aws", "sso", "cache");
    const hasKiroConfig =
      existsSync(kiroDir) ||
      (existsSync(awsSsoDir) && existsSync(join(kiroDir, "credentials")));

    // Try CLI status
    const { stdout, code } = await runCommand(
      det.path,
      ["auth", "status"],
      4000,
    );
    if (code === 0 && !stdout.toLowerCase().includes("not logged in")) {
      return {
        authenticated: true,
        details: stdout || "Logged in via AWS Builder ID / SSO",
      };
    }

    if (hasKiroConfig) {
      return {
        authenticated: true,
        details: "Active session found in ~/.kiro",
      };
    }

    return {
      authenticated: false,
      details: "Not logged in. Run `kiro-cli login`",
    };
  }

  async listModels(): Promise<LocalModel[]> {
    const det = await this.detect();
    if (!det.installed || !det.path) return KIRO_MODELS;
    try {
      const { stdout, code } = await runCommand(det.path, ["models"], 4000);
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
    return KIRO_MODELS;
  }

  async health(): Promise<Health> {
    const start = Date.now();
    const det = await this.detect();
    if (!det.installed || !det.path) {
      return { ok: false, error: "Kiro CLI is not installed" };
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
      yield { type: "error", error: "Kiro CLI not installed" };
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
      "chat",
      "--model",
      request.model || "claude-3-5-sonnet",
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
        error: (err as Error)?.message || "Kiro CLI streaming failed",
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
      command: "npm install -g @kiro/cli",
      url: "https://kiro.dev/docs/cli",
      instructions:
        "Install Kiro CLI, then run `kiro-cli login` to authenticate with your AWS Builder ID or IAM Identity Center.",
    };
  }
}
