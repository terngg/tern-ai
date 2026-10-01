import { OpenRouterClient, type CompletionOptions } from '../openrouter/client.js';
import type { AIProvider, ModelInfo } from './types.js';
export declare class OpenRouterProvider implements AIProvider {
    private readonly create;
    readonly id: "openrouter";
    constructor(create?: (key: string) => OpenRouterClient);
    private call;
    complete(key: string, request: CompletionOptions): Promise<string>;
    listModels(key: string, signal?: AbortSignal): Promise<ModelInfo[]>;
    testConnection(key: string, model: string, signal?: AbortSignal): Promise<void>;
}
