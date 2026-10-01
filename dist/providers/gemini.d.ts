import type { GoogleGenAI } from '@google/genai';
import type { CompletionOptions } from '../openrouter/client.js';
import { ProviderError } from './errors.js';
import type { AIProvider, ModelInfo } from './types.js';
export declare function geminiError(error: unknown, signal?: AbortSignal): ProviderError;
export declare class GeminiProvider implements AIProvider {
    private readonly factory?;
    readonly id: "gemini";
    constructor(factory?: ((key: string) => GoogleGenAI) | undefined);
    private create;
    complete(key: string, request: CompletionOptions): Promise<string>;
    listModels(key: string, signal?: AbortSignal): Promise<ModelInfo[]>;
    testConnection(key: string, model: string, signal?: AbortSignal): Promise<void>;
}
