import type { CompletionOptions } from '../openrouter/client.js';
export const providerIds = ['gemini', 'openrouter'] as const;
export type ProviderId = typeof providerIds[number];
export type ProviderMode = ProviderId | 'auto';
export interface Credential { id: string; provider: ProviderId; key: string; source: 'environment' | 'stored' }
export interface ModelInfo { id: string; name: string }
/** Callback streaming preserves the existing assistant contract; each call is one key/attempt. */
export interface AIProvider {
  id: ProviderId;
  complete(key: string, request: CompletionOptions): Promise<string>;
  listModels(key: string, signal?: AbortSignal): Promise<ModelInfo[]>;
  testConnection(key: string, model: string, signal?: AbortSignal): Promise<void>;
}
export interface CompletionClient { complete(request: CompletionOptions): Promise<string>; managed?: boolean; lastModel?: string }
export function isProvider(value: unknown): value is ProviderId { return value === 'gemini' || value === 'openrouter'; }
