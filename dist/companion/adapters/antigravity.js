import { findBinary, runCommand, spawnStreaming } from "./base.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const AGY_MODELS = [
    { id: "antigravity-flash", name: "Antigravity Flash (Fast)" },
    { id: "antigravity-pro", name: "Antigravity Pro (Deep reasoning)" },
];
export class AntigravityAdapter {
    id = "antigravity";
    name = "Antigravity";
    category = "cli";
    activeProcesses = new Map();
    async detect() {
        let bin = (await findBinary("agy")) || (await findBinary("antigravity"));
        if (!bin) {
            const fallback = join(homedir(), ".local", "bin", "agy");
            if (existsSync(fallback))
                bin = fallback;
        }
        if (bin) {
            const { stdout, code } = await runCommand(bin, ["--version"], 3000);
            return {
                installed: true,
                path: bin,
                version: code === 0 && stdout ? stdout : "2.0",
            };
        }
        return { installed: false };
    }
    async authStatus() {
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
    async listModels() {
        return AGY_MODELS;
    }
    async health() {
        const start = Date.now();
        const det = await this.detect();
        if (!det.installed) {
            return { ok: false, error: "Antigravity not found" };
        }
        return { ok: true, latencyMs: Date.now() - start };
    }
    async *chat(request) {
        const det = await this.detect();
        if (!det.installed || !det.path) {
            yield { type: "error", error: "Antigravity CLI not installed" };
            return;
        }
        const lastMessage = request.messages[request.messages.length - 1]?.content || "";
        const args = ["-p", lastMessage];
        if (request.model === "antigravity-flash" || !request.model) {
            args.unshift("--model", "gemini-3.8-flash-medium");
        }
        else if (request.model === "antigravity-pro") {
            args.unshift("--model", "gemini-3.1-pro-high");
        }
        else {
            args.unshift("--model", request.model);
        }
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
                error: err?.message || "Antigravity execution failed",
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
            command: "curl -fsSL https://antigravity.google/install.sh | sh",
            url: "https://antigravity.google",
            instructions: "Install Antigravity CLI to enable local execution.",
        };
    }
}
//# sourceMappingURL=antigravity.js.map