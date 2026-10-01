import { ConfigStore, type Config } from '../config/store.js';
import { type ApiIndex } from '../gtps/knowledge.js';
import { ModelCatalog } from '../openrouter/models.js';
import { Assistant } from './assistant.js';
import { ProviderClient } from '../providers/fallback.js';
export interface Runtime {
    store: ConfigStore;
    config: Config;
    key: string;
    index: ApiIndex;
    client: ProviderClient;
    catalog: ModelCatalog;
}
export declare function runtime(requireKey?: boolean): Promise<Runtime>;
export declare function assistant(rt: Runtime, onStatus: (message: string) => void): Assistant;
export declare function setVerbose(value: boolean): void;
export declare function verboseEnabled(): boolean;
