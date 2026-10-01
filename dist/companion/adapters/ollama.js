import { findBinary } from "./base.js";
const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
export class OllamaAdapter {
    baseUrl;
    id = "ollama";
    name = "Ollama";
    category = "daemon";
    activeControllers = new Map();
    constructor(baseUrl = DEFAULT_OLLAMA_HOST) {
        this.baseUrl = baseUrl;
    }
    async detect() {
        const bin = await findBinary("ollama");
        try {
            const res = await fetch(`${this.baseUrl}/api/version`, {
                signal: AbortSignal.timeout(2000),
            });
            if (res.ok) {
                const data = (await res.json());
                return {
                    installed: true,
                    version: data.version || "running",
                    path: bin || this.baseUrl,
                };
            }
        }
        catch {
            // Daemon may not be running yet, but binary may be installed
        }
        if (bin) {
            return { installed: true, path: bin };
        }
        return { installed: false };
    }
    async authStatus() {
        try {
            const res = await fetch(`${this.baseUrl}/api/version`, {
                signal: AbortSignal.timeout(2000),
            });
            if (res.ok) {
                return {
                    authenticated: true,
                    details: "Ollama local daemon running",
                };
            }
            return {
                authenticated: false,
                details: "Ollama daemon not responding at " + this.baseUrl,
            };
        }
        catch {
            return {
                authenticated: false,
                details: "Ollama daemon not running (run `ollama serve`)",
            };
        }
    }
    async listModels() {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(3000),
            });
            if (!res.ok)
                return [];
            const data = (await res.json());
            if (!Array.isArray(data.models))
                return [];
            return data.models.map((m) => ({
                id: m.name,
                name: m.name,
            }));
        }
        catch {
            return [];
        }
    }
    async health() {
        const start = Date.now();
        try {
            const res = await fetch(`${this.baseUrl}/api/version`, {
                signal: AbortSignal.timeout(3000),
            });
            const latency = Date.now() - start;
            if (res.ok) {
                return { ok: true, latencyMs: latency };
            }
            return { ok: false, latencyMs: latency, error: `HTTP ${res.status}` };
        }
        catch (err) {
            return { ok: false, error: err?.message || "Connection refused" };
        }
    }
    async *chat(request) {
        const controller = new AbortController();
        this.activeControllers.set(request.id, controller);
        if (request.signal) {
            request.signal.addEventListener("abort", () => controller.abort());
        }
        try {
            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: request.model || "llama3",
                    messages: request.messages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    stream: true,
                    options: {
                        temperature: request.temperature,
                    },
                }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const errorText = await res.text().catch(() => "");
                yield {
                    type: "error",
                    error: `Ollama error (${res.status}): ${errorText.slice(0, 200)}`,
                };
                return;
            }
            if (!res.body) {
                yield { type: "error", error: "Empty response body from Ollama" };
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf8");
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const data = JSON.parse(trimmed);
                        if (data.message?.content) {
                            yield { type: "token", token: data.message.content };
                        }
                        if (data.done) {
                            yield { type: "done" };
                            return;
                        }
                    }
                    catch {
                        /* ignore non-json line */
                    }
                }
            }
            yield { type: "done" };
        }
        catch (err) {
            if (err?.name === "AbortError") {
                yield { type: "error", error: "Request cancelled" };
            }
            else {
                yield {
                    type: "error",
                    error: err?.message || "Ollama stream failure",
                };
            }
        }
        finally {
            this.activeControllers.delete(request.id);
        }
    }
    async cancel(requestId) {
        const c = this.activeControllers.get(requestId);
        if (c) {
            c.abort();
            this.activeControllers.delete(requestId);
        }
    }
    installGuide() {
        return {
            command: "curl -fsSL https://ollama.com/install.sh | sh",
            url: "https://ollama.com/download",
            instructions: "Install Ollama from https://ollama.com, then run `ollama serve` and pull a model (e.g. `ollama run qwen2.5-coder`).",
        };
    }
}
//# sourceMappingURL=ollama.js.map