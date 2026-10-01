export const providerBrandColors: Record<string, string> = {
  openai: "#10a37f",
  gemini: "#1a73e8",
  anthropic: "#d97757",
  openrouter: "#6366f1",
  groq: "#f55036",
  deepseek: "#4d6bfe",
  mistral: "#ff7000",
  together: "#0f62fe",
  fireworks: "#fa541c",
  cerebras: "#ff5000",
  xai: "#ededed",
  "openai-compatible": "#10b981",
  "anthropic-compatible": "#e56a4a",
  "custom-rest": "#8b5cf6",
  "claude-code": "#d97757",
  codex: "#10a37f",
  copilot: "#0078d4",
  cursor: "#60a5fa",
  "gemini-cli": "#1a73e8",
  kiro: "#10b981",
  "qwen-code": "#6366f1",
  cline: "#3b82f6",
  antigravity: "#f59e0b",
  "kilo-code": "#ec4899",
  ollama: "#f3f4f6",
};

export function getProviderColor(id: string): string {
  return providerBrandColors[id] || "#6b7280";
}
