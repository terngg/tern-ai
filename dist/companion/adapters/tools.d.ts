import type { LocalProviderAdapter, DetectionResult, AuthStatus, Health, LocalModel, ChatRequest, StreamEvent, InstallGuide } from "../types.js";
export declare class ClineAdapter implements LocalProviderAdapter {
    private inner;
    readonly id = "cline";
    readonly name = "Cline";
    readonly category: "cli";
    detect: () => Promise<DetectionResult>;
    authStatus: () => Promise<AuthStatus>;
    listModels: () => Promise<LocalModel[]>;
    health: () => Promise<Health>;
    chat: (r: ChatRequest) => AsyncIterable<StreamEvent>;
    cancel: (id: string) => Promise<void>;
    installGuide: () => InstallGuide;
}
export declare class KiloCodeAdapter implements LocalProviderAdapter {
    private inner;
    readonly id = "kilo-code";
    readonly name = "Kilo Code";
    readonly category: "cli";
    detect: () => Promise<DetectionResult>;
    authStatus: () => Promise<AuthStatus>;
    listModels: () => Promise<LocalModel[]>;
    health: () => Promise<Health>;
    chat: (r: ChatRequest) => AsyncIterable<StreamEvent>;
    cancel: (id: string) => Promise<void>;
    installGuide: () => InstallGuide;
}
export declare class CursorAdapter implements LocalProviderAdapter {
    private inner;
    readonly id = "cursor";
    readonly name = "Cursor";
    readonly category: "cli";
    detect: () => Promise<DetectionResult>;
    authStatus: () => Promise<AuthStatus>;
    listModels: () => Promise<LocalModel[]>;
    health: () => Promise<Health>;
    chat: (r: ChatRequest) => AsyncIterable<StreamEvent>;
    cancel: (id: string) => Promise<void>;
    installGuide: () => InstallGuide;
}
export declare class CopilotAdapter implements LocalProviderAdapter {
    private inner;
    readonly id = "copilot";
    readonly name = "Copilot";
    readonly category: "cli";
    detect: () => Promise<DetectionResult>;
    authStatus: () => Promise<AuthStatus>;
    listModels: () => Promise<LocalModel[]>;
    health: () => Promise<Health>;
    chat: (r: ChatRequest) => AsyncIterable<StreamEvent>;
    cancel: (id: string) => Promise<void>;
    installGuide: () => InstallGuide;
}
