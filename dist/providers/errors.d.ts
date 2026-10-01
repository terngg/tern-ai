import { TernError } from '../utils/errors.js';
export type ProviderErrorKind = 'auth' | 'rate_limit' | 'quota' | 'model_not_found' | 'billing' | 'permission' | 'timeout' | 'network' | 'server' | 'incomplete_response' | 'empty_response' | 'output_limit' | 'content_blocked' | 'bad_request' | 'aborted' | 'unknown';
/** Deliberately excludes upstream body, headers, request, cause and SDK error messages. */
export declare class ProviderError extends TernError {
    readonly kind: ProviderErrorKind;
    readonly retryAfterMs?: number | undefined;
    constructor(kind: ProviderErrorKind, retryAfterMs?: number | undefined, status?: number);
}
export declare function httpKind(status: number): ProviderErrorKind;
