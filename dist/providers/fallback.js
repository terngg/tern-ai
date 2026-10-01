import { redact, secretTailLength } from '../utils/security.js';
import { TernError } from '../utils/errors.js';
import { ProviderError } from './errors.js';
export class ProviderClient {
    config;
    pool;
    registry;
    status;
    verbose;
    managed = true;
    lastModel = '';
    lastProvider;
    constructor(config, pool, registry, status = () => undefined, verbose = false) {
        this.config = config;
        this.pool = pool;
        this.registry = registry;
        this.status = status;
        this.verbose = verbose;
    }
    order() { return (this.config.providerMode === 'auto' ? this.config.providerPriority : [this.config.providerMode]).filter(p => this.config.providers[p].enabled); }
    async complete(request) {
        const tried = new Set();
        let last;
        let attempt = 0;
        let streamRecoveryUsed = false;
        const total = this.pool.snapshot().filter(c => this.order().includes(c.provider) && c.status === 'ready').length;
        for (const provider of this.order()) {
            const settings = this.config.providers[provider];
            let credential;
            if (last && this.pool.snapshot().some(c => c.provider === provider && c.status === 'ready'))
                this.status(`Falling back to ${provider} (${settings.model})...`);
            while ((credential = this.pool.select(provider, tried))) {
                if (request.signal?.aborted)
                    throw new ProviderError('aborted');
                tried.add(credential.id);
                attempt++;
                if (this.verbose)
                    this.status(`Provider: ${provider}\nModel: ${settings.model}\nCredential: ${credential.id}\nAttempt: ${attempt}/${total}\nFallback enabled: ${this.config.providerMode === 'auto' ? 'yes' : 'no'}`);
                let pending = '';
                let emitted = false;
                const onToken = (text) => {
                    if (!request.onToken)
                        return;
                    pending += text;
                    // Retain a tail across chunks; redact before forwarding any bytes to callers.
                    const retain = secretTailLength();
                    if (pending.length > retain * 2) {
                        const safe = redact(pending);
                        const split = Math.max(0, safe.length - retain);
                        request.onToken(safe.slice(0, split));
                        pending = safe.slice(split);
                        emitted = true;
                    }
                };
                const safeRequest = { ...request, model: settings.model, free: provider === 'openrouter' && (settings.model === 'openrouter/free' || settings.model.endsWith(':free')), messages: request.messages.map(m => ({ ...m, content: redact(m.content) })), onToken };
                try {
                    let text;
                    try {
                        text = await this.registry[provider].complete(credential.key, safeRequest);
                    }
                    catch (error) {
                        // A clean EOF without a terminal marker is a transport failure, not a
                        // bad credential. Retry a buffered Gemini draft once via the JSON API.
                        // The budget is shared by all keys in this request; never append drafts.
                        const recoverGemini = provider === 'gemini' && safeRequest.stream && !streamRecoveryUsed && error instanceof ProviderError && error.kind === 'incomplete_response';
                        const recoverRouter = provider === 'openrouter' && total === 1 && settings.model === 'openrouter/free' && error instanceof ProviderError && ['server', 'network', 'timeout'].includes(error.kind);
                        if (!request.onToken && (recoverGemini || recoverRouter) && error instanceof ProviderError && !error.retryAfterMs && !request.signal?.aborted) {
                            streamRecoveryUsed = true;
                            this.status(`${provider}: ${error.message}\nRetrying ${settings.model} once without streaming...`);
                            text = await this.registry[provider].complete(credential.key, { ...safeRequest, stream: false });
                        }
                        else
                            throw error;
                    }
                    if (request.signal?.aborted)
                        throw new ProviderError('aborted');
                    this.pool.success(credential.id);
                    this.lastModel = settings.model;
                    this.lastProvider = provider;
                    if (pending)
                        request.onToken?.(redact(pending));
                    return redact(text);
                }
                catch (error) {
                    const normalized = request.signal?.aborted ? new ProviderError('aborted') : error instanceof ProviderError ? error : new ProviderError('unknown');
                    if (normalized.kind === 'aborted')
                        throw normalized;
                    this.pool.failure(credential.id, normalized);
                    last = normalized;
                    if (emitted)
                        this.status('Partial draft discarded. Restarting response after provider failure...');
                    if (this.verbose)
                        this.status(`${credential.id}: ${normalized.message}`);
                    if (['bad_request', 'unknown', 'output_limit', 'content_blocked'].includes(normalized.kind))
                        throw normalized;
                    if (normalized.kind === 'model_not_found') {
                        this.status(`${provider}: ${normalized.message}`);
                        break;
                    }
                }
            }
        }
        if (request.signal?.aborted)
            throw new ProviderError('aborted');
        if (last) {
            if (this.config.providerMode !== 'auto')
                last.message += `\nProvider mode: ${this.config.providerMode}. Cross-provider fallback is disabled; enable with: tern provider set auto`;
            throw last;
        }
        throw new TernError('No usable AI provider credentials. Run tern auth list; check provider settings or wait for cooldown.');
    }
}
//# sourceMappingURL=fallback.js.map