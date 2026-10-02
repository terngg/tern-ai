import { findBinary, runCommand, spawnStreaming } from "./base.js";
import { parseAntigravityModels } from "./antigravity-models.js";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { antigravityPrompt, antigravityText } from "./antigravity-stream.js";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
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
                version: code === 0 && stdout ? stdout : undefined,
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
        const detected = await this.detect();
        if (!detected.installed || !detected.path)
            return [];
        // Official metadata command; uses the local CLI session, never uploads it.
        const result = await runCommand(detected.path, ["models"], 10_000);
        if (result.code !== 0)
            throw new Error("Antigravity model discovery failed. Check local CLI sign-in and connectivity.");
        const models = parseAntigravityModels(result.stdout);
        if (!models.length)
            throw new Error("Antigravity returned no recognized models. Update the local CLI and retry.");
        return models;
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
        const lastMessage = antigravityPrompt(request.messages);
        const args = [
            "-p",
            lastMessage,
            "--disable-slash-commands",
        ];
        args.push("--output-format", "stream-json", "--print-timeout", "85s");
        if (request.model === "antigravity-flash" || !request.model) {
            args.unshift("--model", "gemini-3.8-flash-medium");
        }
        else if (request.model === "antigravity-pro") {
            args.unshift("--model", "gemini-3.1-pro-high");
        }
        else {
            args.unshift("--model", request.model);
        }
        const workspace = await mkdtemp(join(tmpdir(), "tern-antigravity-"));
        const { stream, kill } = spawnStreaming(det.path, args, request.signal, workspace);
        this.activeProcesses.set(request.id, kill);
        try {
            for await (const chunk of antigravityText(stream)) {
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
            kill();
            this.activeProcesses.delete(request.id);
            await rm(workspace, { recursive: true, force: true });
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