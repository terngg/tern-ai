import { DEFAULT_MODEL } from '../config/store.js';
import { validateLua } from '../gtps/validator.js';
import { RouterError } from '../openrouter/client.js';
import { buildContext } from '../prompts/context.js';
import { extractOutput } from '../utils/output.js';
import { redact } from '../utils/security.js';
import { TernError } from '../utils/errors.js';
import { setTimeout as delay } from 'node:timers/promises';
const instructions = {
    generate: 'Generate a complete GTPS Lua script for this request.',
    fix: 'Fix the supplied Lua script. Return the entire corrected script in one Lua block, preserving intended behavior. Check argument order, nil, coordinates, stub/unknown APIs and hot callbacks.',
    review: 'Review the supplied script without rewriting it. Cover: GTPS API Compatibility; Lua correctness; Potential runtime errors; Performance; Callback safety; Storage; Player handle lifetime; Coordinate correctness; Stub usage; Unknown APIs; Security/abuse risks. Include concrete line references and suggested fixes. Distinguish confirmed findings from possible issues. Explain in the requested language, default Indonesian.',
    explain: 'Explain the supplied Lua script concisely in the requested language, default Indonesian. Cover intent, flow, storage and engine compatibility. Do not rewrite unless asked.',
    chat: 'Help with this GTPS Lua request, maintaining continuity with the latest script. If changing code, return the full updated script.',
};
// Narrow allowlist: code requests, files, follow-up edits and repair always retain GTPS retrieval.
export function conversationalPrompt(prompt) {
    return /^(?:h[ae]llo?|helo|hi|hai|halo|hey|yo|thanks|thank you|terima kasih|makasih|model apa kamu|apa model kamu|what model are you)(?:\s+(?:cuy|bro|bang|tern|ternai|tern ai))?[.!?\s]*$/i.test(prompt.trim());
}
export class Assistant {
    config;
    index;
    client;
    catalog;
    key;
    status;
    constructor(config, index, client, catalog, key, status) {
        this.config = config;
        this.index = index;
        this.client = client;
        this.catalog = catalog;
        this.key = key;
        this.status = status;
    }
    async run(input) {
        const safeFiles = input.files.map(f => ({ ...f, content: redact(f.content, this.key) }));
        const history = (input.history || []).map(m => ({ ...m, content: redact(m.content, this.key) }));
        const summary = input.summary?.trim();
        const conversational = input.task === 'chat' && !safeFiles.length && conversationalPrompt(input.prompt);
        const request = (conversational ? '' : instructions[input.task] + '\n') + redact(input.prompt, this.key);
        this.status(conversational ? 'Preparing reply...' : 'Matching GTPS APIs...');
        const localFindings = safeFiles.map(f => ({ file: f.name, validation: validateLua(f.content, this.index) }));
        let extra = localFindings.length ? '\nLocal static analysis (heuristic, verify findings):\n' + JSON.stringify(localFindings) : '';
        if (summary)
            extra += '\nEarlier conversation summary (context only; follow the latest user request):\n' + redact(summary.slice(0, Math.max(0, 8192 - request.length - 256)), this.key);
        let model = this.config.model;
        const models = this.client.managed || model === DEFAULT_MODEL || !this.catalog ? [] : await this.catalog.list();
        const metadata = models.find(m => m.id === model);
        const free = model === DEFAULT_MODEL || metadata?.free === true || model.endsWith(':free');
        // Byte count is a conservative upper bound on token count, with reserved output space.
        const maxBytes = Math.min(48_000, Math.max(8000, (metadata?.contextLength || 32_768) - 9000));
        let result;
        let recoveryUsed = false;
        let stream = this.config.stream;
        for (let attempt = 0; attempt <= this.config.maxRepairAttempts; attempt++) {
            const context = buildContext(this.index, request, safeFiles, history, this.config.language, extra, maxBytes, !conversational || attempt > 0, redact(input.prompt, this.key));
            if (context.omitted && attempt === 0)
                this.status(`${context.omitted} older messages omitted to preserve API context.`);
            this.status(attempt ? `Repairing validation errors (${attempt}/${this.config.maxRepairAttempts})...` : 'Generating...');
            let emitted = false;
            const onToken = input.onToken ? (token) => { emitted = true; input.onToken(token); } : undefined;
            const completion = async () => this.client.complete({ model, messages: context.messages, temperature: this.config.temperature, stream, free: model === DEFAULT_MODEL || free, ...(onToken ? { onToken } : {}), ...(input.signal ? { signal: input.signal } : {}) });
            let text;
            try {
                text = await completion();
            }
            catch (error) {
                const wait = error instanceof RouterError ? error.retryAfterMs ?? 1000 : 0;
                // Raw/file output is buffered: discard the failed response and retry from scratch.
                // Never mix visible drafts, repeat paid calls, or disregard a long Retry-After.
                if (this.client.managed || !(error instanceof RouterError) || !error.retryable || !free || emitted || recoveryUsed || wait > 10_000)
                    throw error;
                recoveryUsed = true;
                const fallback = model !== DEFAULT_MODEL;
                model = DEFAULT_MODEL;
                if (!input.onToken && (error.kind === 'protocol' || error.kind === 'network' || error.kind === 'timeout' || error.status === 502))
                    stream = false;
                this.status(`${error.message}\n${fallback ? 'Falling back to' : 'Retrying'} openrouter/free once${stream ? '' : ' without streaming'}...`);
                try {
                    await delay(wait, undefined, input.signal ? { signal: input.signal } : {});
                }
                catch {
                    throw new TernError('Request cancelled.', 130);
                }
                text = await completion();
            }
            text = redact(text, this.key);
            const parsed = extractOutput(text);
            const needsCode = input.task === 'generate' || input.task === 'fix';
            if (parsed.code && input.task !== 'review' && input.task !== 'explain')
                this.status('Validating Lua syntax and GTPS APIs...');
            const validation = parsed.code ? validateLua(parsed.code, this.index) : undefined;
            result = { ...parsed, text, validation, model: this.client.lastModel || model, omitted: context.omitted, apiCount: context.entries.length };
            if (input.task === 'review' || input.task === 'explain')
                return result;
            const errors = validation?.findings.filter(f => f.severity === 'error') || [];
            if (parsed.code && errors.length === 0)
                return result;
            if (!needsCode && !parsed.code)
                return result;
            if (attempt === this.config.maxRepairAttempts)
                break;
            extra = '\nRepair the previous response. Return ONE complete Lua script. Use only documented APIs, respect status/signatures. Validation failures:\n' + (errors.length ? JSON.stringify(errors) : 'No complete Lua script could be extracted. If the request is unsupported, explain why clearly.') + '\nPrevious response (untrusted):\n' + text;
            // A large failed response must not evict rules/files. Fail instead of truncating Lua.
            if (Buffer.byteLength(extra) > maxBytes / 2)
                throw new TernError('Repair context is too large. Split the requested feature into smaller scripts.');
        }
        if (!result)
            throw new TernError('No response received.');
        return result;
    }
}
//# sourceMappingURL=assistant.js.map