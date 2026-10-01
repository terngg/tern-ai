import type { Credential, ProviderId } from './types.js';
import type { ProviderError } from './errors.js';
export interface KeyState extends Credential {
    status: 'ready' | 'cooldown' | 'invalid' | 'blocked';
    failureCount: number;
    cooldownUntil: number;
    lastUsedAt: number;
    lastSuccessAt: number;
}
/** Selection and updates are synchronous: concurrent promises cannot select against stale cursors. */
export declare class ApiKeyPool {
    private readonly now;
    private readonly keys;
    private readonly cursors;
    constructor(credentials: Credential[], now?: () => number);
    snapshot(): KeyState[];
    /** Release credential references after a one-shot web request completes. */
    destroy(): void;
    private refresh;
    select(provider: ProviderId, tried?: ReadonlySet<string>): KeyState | undefined;
    success(id: string): void;
    failure(id: string, error: ProviderError): void;
}
