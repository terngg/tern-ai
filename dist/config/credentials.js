import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigStore, privateJson } from './store.js';
import { isMissing, record, TernError } from '../utils/errors.js';
import { registerSecrets } from '../utils/security.js';
import { isProvider, providerIds } from '../providers/types.js';
export function fingerprint(key) { return createHash('sha256').update(key).digest('hex'); }
const empty = () => ({ version: 1, next: { gemini: 1, openrouter: 1 }, credentials: [] });
export class CredentialStore {
    config;
    constructor(config = new ConfigStore()) {
        this.config = config;
    }
    async read() {
        try {
            const value = JSON.parse(await readFile(join(this.config.directory, 'credentials.json'), 'utf8'));
            // Existing 0.1.x credentials migrate in memory; persisted only on explicit mutation.
            if (record(value) && typeof value.key === 'string' && value.key.trim())
                return { version: 1, next: { gemini: 1, openrouter: 2 }, credentials: [{ id: 'openrouter-1', provider: 'openrouter', key: value.key.trim(), source: 'stored' }] };
            if (!record(value) || value.version !== 1 || !record(value.next) || !Array.isArray(value.credentials))
                throw new Error();
            const ids = new Set();
            for (const c of value.credentials) {
                if (!record(c) || !isProvider(c.provider) || typeof c.key !== 'string' || !c.key.trim() || typeof c.id !== 'string' || !new RegExp(`^${c.provider}-[1-9][0-9]*$`).test(c.id) || ids.has(c.id) || c.source !== 'stored')
                    throw new Error();
                ids.add(c.id);
            }
            for (const p of providerIds)
                if (!Number.isSafeInteger(value.next[p]) || Number(value.next[p]) < 1 || value.credentials.some(c => c.provider === p && Number(c.id.split('-').at(-1)) >= Number(value.next[p])))
                    throw new Error();
            return value;
        }
        catch (error) {
            if (isMissing(error))
                return empty();
            throw new TernError('Cannot read credentials.json. Restore a valid credential file; no credentials were changed.');
        }
    }
    async load(env = process.env) {
        const stored = (await this.read()).credentials;
        const result = [];
        const seen = new Set();
        for (const provider of providerIds) {
            const prefix = provider.toUpperCase() + '_API_KEY';
            const names = Object.keys(env).filter(n => n === prefix || new RegExp(`^${prefix}_[1-9][0-9]*$`).test(n)).sort((a, b) => a === prefix ? -1 : b === prefix ? 1 : Number(a.slice(prefix.length + 1)) - Number(b.slice(prefix.length + 1)) || a.localeCompare(b));
            for (const name of names) {
                const key = env[name]?.trim();
                if (!key)
                    continue;
                const hash = provider + fingerprint(key);
                if (seen.has(hash))
                    continue;
                seen.add(hash);
                const match = stored.find(c => c.provider === provider && fingerprint(c.key) === fingerprint(key));
                result.push({ id: match?.id || `${provider}-env-${name === prefix ? 'default' : name.slice(prefix.length + 1)}`, provider, key, source: 'environment' });
            }
            for (const c of stored.filter(c => c.provider === provider)) {
                const hash = provider + fingerprint(c.key);
                if (!seen.has(hash)) {
                    seen.add(hash);
                    result.push(c);
                }
            }
        }
        registerSecrets(result.map(c => c.key));
        return result;
    }
    async add(provider, raw, env = process.env) {
        const key = raw.trim();
        if (!key || key.length < 8 || key.length > 1024 || /\s/.test(key) || (provider === 'openrouter' && !/^sk-or-[\w-]{8,}$/.test(key)))
            throw new TernError('Invalid credential format.');
        const duplicate = (await this.load(env)).find(c => c.provider === provider && fingerprint(c.key) === fingerprint(key));
        if (duplicate)
            return { credential: duplicate, duplicate: true };
        const data = await this.read();
        const credential = { id: `${provider}-${data.next[provider]++}`, provider, key, source: 'stored' };
        data.credentials.push(credential);
        registerSecrets([key]);
        await this.save(data);
        return { credential, duplicate: false };
    }
    async remove(id) {
        const data = await this.read();
        const index = data.credentials.findIndex(c => c.id === id);
        if (index < 0)
            throw new TernError('Stored credential not found. Environment credentials must be unset in your shell.');
        data.credentials.splice(index, 1);
        await this.save(data);
    }
    async save(data) { await this.config.prepare(); await privateJson(join(this.config.directory, 'credentials.json'), data); }
}
//# sourceMappingURL=credentials.js.map