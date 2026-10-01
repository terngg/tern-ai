import type { Task, TaskResult } from './assistant.js';
export interface TaskOptions {
    output?: string;
    force?: boolean;
    raw?: boolean;
    write?: boolean;
    file?: string[];
}
export declare function checkResult(result: TaskResult): string;
export declare function runTask(task: Task, prompt: string, paths: string[], options: TaskOptions): Promise<void>;
