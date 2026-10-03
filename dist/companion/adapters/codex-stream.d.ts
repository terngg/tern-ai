import type { LocalModel } from "../types.js";
export interface CodexModel extends LocalModel {
    defaultReasoningEffort?: string;
    reasoningEfforts?: string[];
}
export declare function parseCodexModels(text: string): CodexModel[];
export interface CodexUsage {
    inputTokens: number;
    outputTokens: number;
}
export declare function codexText(source: AsyncIterable<string>, onUsage?: (usage: CodexUsage) => void): AsyncIterable<string>;
