import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
import type { AIProvider, ProviderId } from './types.js';
export type ProviderRegistry = Record<ProviderId,AIProvider>;
export function providerRegistry():ProviderRegistry { return {gemini:new GeminiProvider(),openrouter:new OpenRouterProvider()}; }
