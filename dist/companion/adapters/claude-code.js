import { findBinary, runCommand, spawnStreaming } from "./base.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const CLAUDE_MODELS = [
    { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet (Hybrid reasoning)" },
    { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (Coding leader)" },
    { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku (Fast & light)" },
];
export class ClaudeCodeAdapter {
    id = "claude-code";
    name = "Claude Code";
    category = "cli";
    activeProcesses = new Map();
    async detect() {
        const bin = (await findBinary("claude")) || (await findBinary("claude-code"));
        if (!bin)
            return { installed: false };
        const { stdout, code } = await runCommand(bin, ["--version"], 3000);
        return {
            installed: true,
            path: bin,
            version: code === 0 && stdout ? stdout : undefined,
        };
    }
    async authStatus() {
        const det = await this.detect();
        if (!det.installed || !det.path) {
            return { authenticated: false, details: "Claude Code CLI not installed" };
        }
        const configPath = join(homedir(), ".claude.json");
        if (existsSync(configPath)) {
            return { authenticated: true, details: "Logged in (~/.claude.json)" };
        }
        const { stdout, code } = await runCommand(det.path, ["auth", "status"], 3000);
        if (code === 0 && stdout) {
            return { authenticated: true, details: stdout };
        }
        return {
            authenticated: false,
            details: "Not logged in. Run `claude login`",
        };
    }
    async listModels() {
        return CLAUDE_MODELS;
    }
    async health() {
        const start = Date.now();
        const det = await this.detect();
        if (!det.installed || !det.path) {
            return { ok: false, error: "Claude CLI not installed" };
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
    async *chat(request) {
        const det = await this.detect();
        if (!det.installed || !det.path) {
            yield { type: "error", error: "Claude Code CLI not installed" };
            return;
        }
        const lastMessage = request.messages[request.messages.length - 1]?.content || "";
        const systemPrompt = request.messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        const fullPrompt = systemPrompt
            ? `${systemPrompt}\n\n${lastMessage}`
            : lastMessage;
        const args = ["--print", fullPrompt];
        const { stream, kill } = spawnStreaming(det.path, args, request.signal);
        this.activeProcesses.set(request.id, kill);
        try {
            for await (const chunk of stream) {
                yield { type: "token", token: chunk };
            }
            yield { type: "done" };
        }
        catch (err) {
            yield {
                type: "error",
                error: err?.message || "Claude CLI streaming failed",
            };
        }
        finally {
            this.activeProcesses.delete(request.id);
        }
    }
    async cancel(requestId) {
        const kill = this.activeProcesses.get(requestId);
        if (kill) {
            kill();
            this.activeProcesses.delete(requestId);
        }
    }
    installGuide() {
        return {
            command: "npm install -g @anthropic-ai/claude-code",
            url: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
            instructions: "Install Claude Code using `npm install -g @anthropic-ai/claude-code`, then run `claude` to complete browser login.",
        };
    }
}
//# sourceMappingURL=claude-code.js.map