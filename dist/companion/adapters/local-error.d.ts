export type LocalErrorCategory = "auth_failure" | "permission_denied" | "bad_request" | "rate_limit" | "quota_exhausted" | "timeout" | "provider_overload" | "server_error" | "network";
export declare class LocalProviderError extends Error {
    readonly category: LocalErrorCategory;
    constructor(category: LocalErrorCategory);
}
export declare function localProviderError(diagnostic: unknown): LocalProviderError;
