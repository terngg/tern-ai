import type { LocalProviderAdapter, DetectionResult, AuthStatus, Health, LocalModel, ChatRequest, StreamEvent, InstallGuide } from "../types.js";
export declare class OllamaAdapter implements LocalProviderAdapter {
    private baseUrl;
    readonly id = "ollama";
    readonly name = "Ollama";
    readonly category: "daemon";
    private activeControllers;
    constructor(baseUrl?: string);
    detect(): Promise<DetectionResult>;
    authStatus(): Promise<AuthStatus>;
    listModels(): Promise<LocalModel[]>;
    health(): Promise<Health>;
    chat(request: ChatRequest): AsyncIterable<StreamEvent>;
    cancel(requestId: string): Promise<void>;
    installGuide(): InstallGuide;
}
