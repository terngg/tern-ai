import type { AIProvider, ProviderId } from './types.js';
export type ProviderRegistry = Record<ProviderId, AIProvider>;
export declare function providerRegistry(): ProviderRegistry;
