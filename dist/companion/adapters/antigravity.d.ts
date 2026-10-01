import type { LocalProviderAdapter, DetectionResult, AuthStatus, Health, LocalModel, ChatRequest, StreamEvent, InstallGuide } from "../types.js";
export declare class AntigravityAdapter implements LocalProviderAdapter {
    readonly id = "antigravity";
    readonly name = "Antigravity";
    readonly category: "cli";
    private activeProcesses;
    detect(): Promise<DetectionResult>;
    authStatus(): Promise<AuthStatus>;
    listModels(): Promise<LocalModel[]>;
    health(): Promise<Health>;
    chat(request: ChatRequest): AsyncIterable<StreamEvent>;
    cancel(requestId: string): Promise<void>;
    installGuide(): InstallGuide;
}
