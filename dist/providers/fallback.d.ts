import type { Config } from '../config/store.js';
import type { CompletionOptions } from '../openrouter/client.js';
import { ApiKeyPool } from './key-pool.js';
import type { ProviderRegistry } from './registry.js';
import type { CompletionClient, ProviderId } from './types.js';
export declare class ProviderClient implements CompletionClient {
    config: Config;
    readonly pool: ApiKeyPool;
    private readonly registry;
    status: (message: string) => void;
    verbose: boolean;
    readonly managed = true;
    lastModel: string;
    lastProvider: ProviderId | undefined;
    constructor(config: Config, pool: ApiKeyPool, registry: ProviderRegistry, status?: (message: string) => void, verbose?: boolean);
    order(): ProviderId[];
    complete(request: CompletionOptions): Promise<string>;
}
