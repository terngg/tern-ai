import { type CodexModel } from "./codex-stream.js";
/** Read the account's official picker catalog without starting an inference turn. */
export declare function discoverCodexModels(bin: string, timeoutMs?: number, args?: string[]): Promise<CodexModel[]>;
