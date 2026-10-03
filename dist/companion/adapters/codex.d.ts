import type { LocalProviderAdapter, DetectionResult, AuthStatus, Health, ChatRequest, StreamEvent, InstallGuide } from "../types.js";
import { type CodexModel } from "./codex-stream.js";
export declare class CodexAdapter implements LocalProviderAdapter {
    readonly id = "codex";
    readonly name = "Codex CLI";
    readonly category: "cli";
    private activeProcesses;
    detect(): Promise<DetectionResult>;
    authStatus(): Promise<AuthStatus>;
    listModels(): Promise<CodexModel[]>;
    health(): Promise<Health>;
    chat(request: ChatRequest): AsyncIterable<StreamEvent>;
    cancel(requestId: string): Promise<void>;
    installGuide(): InstallGuide;
}
