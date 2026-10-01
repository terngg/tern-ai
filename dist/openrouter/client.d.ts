export { RouterError } from './errors.js';
export { contentFromResponse } from './response.js';
export declare const BASE_URL = "https://openrouter.ai/api/v1";
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface CompletionOptions {
    model: string;
    messages: Message[];
    temperature: number;
    stream: boolean;
    free: boolean;
    onToken?: (token: string) => void;
    signal?: AbortSignal;
}
export declare class OpenRouterClient {
    private readonly key;
    private readonly fetcher;
    private readonly timeoutMs;
    constructor(key: string, fetcher?: typeof fetch, timeoutMs?: number);
    get(path: '/models' | '/key', signal?: AbortSignal): Promise<unknown>;
    complete(options: CompletionOptions): Promise<string>;
    private translate;
}
