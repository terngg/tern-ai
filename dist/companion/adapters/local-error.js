export class LocalProviderError extends Error {
    category;
    constructor(category) {
        super(`Local provider failed (${category}). Check CLI sign-in and diagnostics locally.`);
        this.category = category;
    }
}
// Diagnostics are inspected locally only. Never include them in an exception,
// relay event or persisted trace. A temporary quota/429 is a cooldown, not proof
// that the entire account has permanently exhausted its balance.
export function localProviderError(diagnostic) {
    const text = typeof diagnostic === "string" ? diagnostic.slice(0, 16_384) : "";
    const category = /insufficient[_ ](?:credits|balance)|credit balance.*(?:exhausted|too low)|billing_hard_limit/i.test(text) ? "quota_exhausted" :
        /429|rate.?limit|quota.*(?:exceed|exhaust)|resource[_ ]exhausted/i.test(text) ? "rate_limit" :
            /401|unauthenticated|authentication required|sign.?in required|invalid[_ ](?:api[_ ]key|token)/i.test(text) ? "auth_failure" :
                /403|permission.?denied|access.?denied/i.test(text) ? "permission_denied" :
                    /deadline|timed? ?out|timeout/i.test(text) ? "timeout" :
                        /503|529|overloaded|temporarily unavailable/i.test(text) ? "provider_overload" :
                            /unknown model|invalid model|unsupported model|invalid.argument|bad request/i.test(text) ? "bad_request" :
                                /ECONNRESET|ENOTFOUND|ECONNREFUSED|network|connection refused/i.test(text) ? "network" : "server_error";
    return new LocalProviderError(category);
}
//# sourceMappingURL=local-error.js.map