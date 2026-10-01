export declare function startCompanionDaemon(): Promise<void>;
export declare function stopCompanionDaemon(): Promise<void>;
export declare function pairCompanion(code: string, options: {
    server?: string;
}): Promise<void>;
export declare function companionStatus(): Promise<void>;
export declare function companionProviders(): Promise<void>;
export declare function runCompanion(): Promise<void>;
