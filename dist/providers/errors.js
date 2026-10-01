import { TernError } from '../utils/errors.js';
const messages = {
    auth: 'Invalid API key. Run tern auth list or tern auth add.',
    rate_limit: 'Rate limited; credential is cooling down.', quota: 'Quota exhausted; credential is cooling down.',
    model_not_found: 'Model unavailable. Use tern models <provider> and tern model set <provider> <model>.',
    billing: 'Billing/payment required. No paid model was selected automatically.', permission: 'Permission denied. Check API/project permissions.',
    timeout: 'Request timed out.', network: 'Provider connection failed.', server: 'Provider server error.',
    incomplete_response: 'Provider response is incomplete: no completion marker was received. Partial output was discarded.',
    empty_response: 'Provider completed without response text.',
    output_limit: 'Provider reached the output token limit. No partial script was saved. Split the requested feature into smaller steps.',
    content_blocked: 'Provider blocked this request or response. No partial script was saved.',
    bad_request: 'Provider rejected the request. Check input size and model options.', aborted: 'Request cancelled.', unknown: 'Provider request failed.',
};
/** Deliberately excludes upstream body, headers, request, cause and SDK error messages. */
export class ProviderError extends TernError {
    kind;
    retryAfterMs;
    constructor(kind, retryAfterMs, status) {
        super(messages[kind] + (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? ` (HTTP ${status})` : ''), kind === 'aborted' ? 130 : 1);
        this.kind = kind;
        this.retryAfterMs = retryAfterMs;
    }
}
export function httpKind(status) {
    if (status === 401)
        return 'auth';
    if (status === 402)
        return 'billing';
    if (status === 403)
        return 'permission';
    if (status === 404)
        return 'model_not_found';
    if (status === 408 || status === 504)
        return 'timeout';
    if (status === 429)
        return 'rate_limit';
    if (status >= 500)
        return 'server';
    if (status >= 400)
        return 'bad_request';
    return 'unknown';
}
//# sourceMappingURL=errors.js.map