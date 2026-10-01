import { OllamaAdapter } from "./adapters/ollama.js";
import { CodexAdapter } from "./adapters/codex.js";
import { KiroAdapter } from "./adapters/kiro.js";
import { ClaudeCodeAdapter } from "./adapters/claude-code.js";
import { GeminiCliAdapter } from "./adapters/gemini-cli.js";
import { QwenCodeAdapter } from "./adapters/qwen-code.js";
import { AntigravityAdapter } from "./adapters/antigravity.js";
import { ClineAdapter, KiloCodeAdapter, CursorAdapter, CopilotAdapter, } from "./adapters/tools.js";
const adapters = [
    new OllamaAdapter(),
    new CodexAdapter(),
    new KiroAdapter(),
    new ClaudeCodeAdapter(),
    new GeminiCliAdapter(),
    new QwenCodeAdapter(),
    new AntigravityAdapter(),
    new ClineAdapter(),
    new KiloCodeAdapter(),
    new CursorAdapter(),
    new CopilotAdapter(),
];
export function getLocalAdapters() {
    return adapters;
}
export function getLocalAdapter(id) {
    return adapters.find((a) => a.id === id);
}
//# sourceMappingURL=registry.js.map