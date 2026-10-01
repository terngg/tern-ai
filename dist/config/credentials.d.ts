import { ConfigStore } from './store.js';
import { type Credential, type ProviderId } from '../providers/types.js';
export declare function fingerprint(key: string): string;
export declare class CredentialStore {
    readonly config: ConfigStore;
    constructor(config?: ConfigStore);
    private read;
    load(env?: NodeJS.ProcessEnv): Promise<Credential[]>;
    add(provider: ProviderId, raw: string, env?: NodeJS.ProcessEnv): Promise<{
        credential: Credential;
        duplicate: boolean;
    }>;
    remove(id: string): Promise<void>;
    private save;
}
