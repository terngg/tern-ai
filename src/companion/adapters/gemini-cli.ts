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

const GEMINI_MODELS: LocalModel[] = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Next-gen multimodal)" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Complex reasoning)" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Fast)" },
];

export class GeminiCliAdapter implements LocalProviderAdapter {
  readonly id = "gemini-cli";
  readonly name = "Gemini CLI";
  readonly category = "cli" as const;
  private activeProcesses = new Map<string, () => void>();

  async detect(): Promise<DetectionResult> {
    const bin = (await findBinary("gemini")) || (await findBinary("gemini-cli"));
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
      return { authenticated: false, details: "Gemini CLI not installed" };
    }

    const gcloudToken = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (gcloudToken) {
      return {
        authenticated: true,
        details: "Authenticated via local environment key",
      };
    }

    const geminiDir = join(homedir(), ".gemini");
    if (existsSync(geminiDir)) {
      return { authenticated: true, details: "Config found in ~/.gemini" };
    }

    const { stdout, code } = await runCommand(det.path, ["auth", "status"], 3000);
    if (code === 0 && stdout) {
      return { authenticated: true, details: stdout };
    }

    return {
      authenticated: false,
      details: "Not logged in. Run `gemini auth login`",
    };
  }

  async listModels(): Promise<LocalModel[]> {
    return GEMINI_MODELS;
  }

  async health(): Promise<Health> {
    const start = Date.now();
    const det = await this.detect();
    if (!det.installed || !det.path) {
      return { ok: false, error: "Gemini CLI not installed" };
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
      yield { type: "error", error: "Gemini CLI not installed" };
      return;
    }

    const lastMessage =
      request.messages[request.messages.length - 1]?.content || "";
    const args = [
      "generate",
      "--model",
      request.model || "gemini-2.0-flash",
      "--prompt",
      lastMessage,
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
        error: (err as Error)?.message || "Gemini CLI streaming failed",
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
      command: "npm install -g @google/gemini-cli",
      url: "https://ai.google.dev",
      instructions:
        "Install Gemini CLI using `npm install -g @google/gemini-cli`, then run `gemini auth login`.",
    };
  }
}
