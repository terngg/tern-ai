import { OpenRouterClient, RouterError } from '../openrouter/client.js';
import { parseModels } from '../openrouter/models.js';
import { TernError } from '../utils/errors.js';
import { httpKind, ProviderError } from './errors.js';
export class OpenRouterProvider {
    create;
    id = 'openrouter';
    constructor(create = key => new OpenRouterClient(key)) {
        this.create = create;
    }
    async call(fn, signal) {
        try {
            return await fn();
        }
        catch (error) {
            if (signal?.aborted || error instanceof TernError && error.exitCode === 130)
                throw new ProviderError('aborted');
            if (error instanceof ProviderError)
                throw error;
            if (error instanceof RouterError)
                throw new ProviderError(error.kind === 'network' ? 'network' : error.kind === 'timeout' ? 'timeout' : httpKind(error.status), error.retryAfterMs, error.status);
            throw new ProviderError('unknown');
        }
    }
    complete(key, request) { return this.call(() => this.create(key).complete(request), request.signal); }
    listModels(key, signal) { return this.call(async () => parseModels(await this.create(key).get('/models', signal)), signal); }
    testConnection(key, model, signal) {
        return this.call(async () => {
            await this.create(key).get('/key', signal);
            const models = await this.listModels(key, signal);
            if (!models.some(m => m.id === model))
                throw new ProviderError('model_not_found');
        }, signal);
    }
}
//# sourceMappingURL=openrouter.js.map