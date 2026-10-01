/** Selection and updates are synchronous: concurrent promises cannot select against stale cursors. */
export class ApiKeyPool {
    now;
    keys;
    cursors = new Map();
    constructor(credentials, now = Date.now) {
        this.now = now;
        this.keys = credentials.map(c => ({ ...c, status: 'ready', failureCount: 0, cooldownUntil: 0, lastUsedAt: 0, lastSuccessAt: 0 }));
    }
    snapshot() { this.refresh(); return this.keys.map(c => ({ ...c })); }
    /** Release credential references after a one-shot web request completes. */
    destroy() { for (const credential of this.keys)
        credential.key = ''; }
    refresh() { for (const c of this.keys)
        if (c.status === 'cooldown' && c.cooldownUntil <= this.now())
            c.status = 'ready'; }
    select(provider, tried = new Set()) {
        this.refresh();
        const keys = this.keys.filter(c => c.provider === provider);
        const start = this.cursors.get(provider) || 0;
        for (let i = 0; i < keys.length; i++) {
            const index = (start + i) % keys.length;
            const c = keys[index];
            if (c?.status === 'ready' && !tried.has(c.id)) {
                this.cursors.set(provider, (index + 1) % keys.length);
                c.lastUsedAt = this.now();
                return { ...c };
            }
        }
        return undefined;
    }
    success(id) { const c = this.keys.find(c => c.id === id); if (c) {
        c.lastSuccessAt = this.now();
        c.failureCount = 0;
    } }
    failure(id, error) {
        const c = this.keys.find(c => c.id === id);
        if (!c)
            return;
        c.failureCount++;
        // A later completion from a concurrent request must not revive an invalid key.
        if (c.status === 'invalid')
            return;
        if (error.kind === 'auth')
            c.status = 'invalid';
        else if (error.kind === 'billing' || error.kind === 'permission')
            c.status = 'blocked';
        else if (error.kind === 'rate_limit' || error.kind === 'quota') {
            c.status = 'cooldown';
            c.cooldownUntil = this.now() + Math.max(1000, error.retryAfterMs ?? Math.min(120_000, 30_000 * 2 ** Math.min(2, c.failureCount - 1)));
        }
    }
}
//# sourceMappingURL=key-pool.js.map