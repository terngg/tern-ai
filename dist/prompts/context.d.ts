import type { Message } from '../openrouter/client.js';
import type { FileContext } from '../utils/files.js';
import { ApiIndex, type ApiEntry } from '../gtps/knowledge.js';
export interface ContextResult {
    messages: Message[];
    entries: ApiEntry[];
    omitted: number;
}
export declare function buildContext(index: ApiIndex, request: string, files: FileContext[], history: Message[], language: string, extra?: string, maxBytes?: number, includeApi?: boolean): ContextResult;
