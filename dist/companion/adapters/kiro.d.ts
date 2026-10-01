import type { LocalProviderAdapter, DetectionResult, AuthStatus, Health, LocalModel, ChatRequest, StreamEvent, InstallGuide } from "../types.js";
export declare class KiroAdapter implements LocalProviderAdapter {
    readonly id = "kiro";
    readonly name = "Kiro";
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
