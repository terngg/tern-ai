import type { CompletionClient } from '../providers/types.js';
import type { Config } from '../config/store.js';
import type { ApiIndex } from '../gtps/knowledge.js';
import { type Validation } from '../gtps/validator.js';
import { type Message } from '../openrouter/client.js';
import type { ModelCatalog } from '../openrouter/models.js';
import type { FileContext } from '../utils/files.js';
import { type ParsedOutput } from '../utils/output.js';
export type Task = 'generate' | 'fix' | 'review' | 'explain' | 'chat';
export interface TaskInput {
    task: Task;
    prompt: string;
    files: FileContext[];
    history?: Message[];
    summary?: string;
    onToken?: (token: string) => void;
    signal?: AbortSignal;
}
export interface TaskResult extends ParsedOutput {
    text: string;
    validation: Validation | undefined;
    model: string;
    omitted: number;
    apiCount: number;
}
export declare class Assistant {
    private readonly config;
    private readonly index;
    private readonly client;
    private readonly catalog;
    private readonly key;
    private readonly status;
    constructor(config: Config, index: ApiIndex, client: CompletionClient, catalog: ModelCatalog | undefined, key: string, status: (message: string) => void);
    run(input: TaskInput): Promise<TaskResult>;
}
