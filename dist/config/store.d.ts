import { type ProviderMode, type ProviderId } from '../providers/types.js';
export { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL } from './provider-defaults.js';
export interface Config {
    providerMode: ProviderMode;
    providerPriority: ProviderId[];
    providers: Record<ProviderId, {
        enabled: boolean;
        model: string;
    }>;
    model: string;
    temperature: number;
    language: string;
    stream: boolean;
    maxRepairAttempts: number;
}
export declare const defaults: Readonly<Config>;
export declare function configDir(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string;
export declare function validateConfig(input: unknown): Config;
export declare function privateJson(path: string, value: unknown): Promise<void>;
export declare class ConfigStore {
    readonly directory: string;
    constructor(directory?: string);
    prepare(): Promise<void>;
    load(): Promise<Config>;
    set(key: string, value: unknown): Promise<Config>;
    credential(env?: NodeJS.ProcessEnv): Promise<{
        key: string;
        source: string;
    } | undefined>;
    saveCredential(key: string): Promise<void>;
    setModel(provider: ProviderId, model: string): Promise<Config>;
    logout(): Promise<void>;
}
