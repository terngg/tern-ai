// Shared Tern engine entry point. The CLI and Web app use the same provider,
// prompt, GTPS retrieval and validation modules.
export { Assistant } from "../../../src/commands/assistant.js";
export type {
  Task,
  TaskInput,
  TaskResult,
} from "../../../src/commands/assistant.js";
export {
  ConfigStore,
  defaults,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MODEL,
} from "../../../src/config/store.js";
export type { Config } from "../../../src/config/store.js";
export {
  ApiIndex,
  formatEntry,
  loadKnowledge,
  parseDocs,
} from "../../../src/gtps/knowledge.js";
export type { ApiEntry, ApiStatus } from "../../../src/gtps/knowledge.js";
export { validateLua } from "../../../src/gtps/validator.js";
export type { Validation, Finding } from "../../../src/gtps/validator.js";
export { ProviderClient } from "../../../src/providers/fallback.js";
export { ApiKeyPool } from "../../../src/providers/key-pool.js";
export { providerRegistry } from "../../../src/providers/registry.js";
export type {
  Credential,
  ProviderId,
  ProviderMode,
  ModelInfo,
} from "../../../src/providers/types.js";
export { GeminiProvider } from "../../../src/providers/gemini.js";
export { OpenRouterProvider } from "../../../src/providers/openrouter.js";
export { parseModels } from "../../../src/openrouter/models.js";
export type { Model } from "../../../src/openrouter/models.js";
