import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
export function providerRegistry() { return { gemini: new GeminiProvider(), openrouter: new OpenRouterProvider() }; }
//# sourceMappingURL=registry.js.map