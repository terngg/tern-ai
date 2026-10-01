export declare class TernError extends Error {
    readonly exitCode: number;
    constructor(message: string, exitCode?: number);
}
export declare function isMissing(error: unknown): boolean;
export declare function messageOf(error: unknown): string;
export declare function record(value: unknown): value is Record<string, unknown>;
