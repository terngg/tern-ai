import type { Runtime } from './runtime.js';
/** The displayed list belongs to this session; numbers always refer to that exact list. */
export declare class ChatModels {
    private readonly rt;
    private selection;
    constructor(rt: Runtime);
    private defaultProvider;
    list(name?: string, signal?: AbortSignal): Promise<void>;
    model(arg: string, signal?: AbortSignal): Promise<void>;
}
