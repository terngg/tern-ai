import { type ChildProcess } from "node:child_process";
export declare function findBinary(name: string): Promise<string | null>;
export declare function runCommand(bin: string, args: string[], timeoutMs?: number): Promise<{
    stdout: string;
    stderr: string;
    code: number;
}>;
export declare function spawnStreaming(bin: string, args: string[], signal?: AbortSignal, cwd?: string): {
    process: ChildProcess;
    stream: AsyncIterable<string>;
    kill: () => void;
};
