import { TernError } from '../utils/errors.js';
export type RouterErrorKind = 'http' | 'provider' | 'protocol' | 'network' | 'timeout';
interface ErrorOptions {
    kind?: RouterErrorKind;
    retryAfterMs?: number | undefined;
}
export declare class RouterError extends TernError {
    readonly status: number;
    readonly kind: RouterErrorKind;
    readonly retryAfterMs: number | undefined;
    constructor(status: number, detail?: string, options?: ErrorOptions);
    get retryable(): boolean;
}
export declare function protocolError(detail: string): RouterError;
export declare function retryAfter(value: string | null, now?: number): number | undefined;
export declare function responseError(value: unknown, secret?: string, httpStatus?: number, retryAfterMs?: number): RouterError | undefined;
export declare function networkError(error: unknown): RouterError;
export {};
