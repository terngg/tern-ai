import { ConfigStore } from '../config/store.js';
import { CredentialStore } from '../config/credentials.js';
import { loadKnowledge } from '../gtps/knowledge.js';
import { output } from '../cli/io.js';
import { messageOf } from '../utils/errors.js';
import { providerRegistry } from '../providers/registry.js';
import { providerIds } from '../providers/types.js';
import { ProviderError } from '../providers/errors.js';
export async function doctor(offline = false) {
    output('Tern Doctor');
    let critical = false;
    let usable = false;
    const check = async (label, fn) => {
        try {
            output(`✓ ${label}: ${await fn()}`);
        }
        catch (error) {
            critical = true;
            output(`✗ ${label}: ${messageOf(error)}`);
        }
    };
    await check('Node.js', async () => { const [major, minor] = process.versions.node.split('.').map(Number); if ((major || 0) < 22 || major === 22 && (minor || 0) < 16)
        throw new Error('Node.js 22.16+ required'); return process.version; });
    const store = new ConfigStore();
    await check('Configuration', async () => { await store.load(); return 'valid'; });
    await check('GTPS documentation and retrieval index', async () => {
        const index = await loadKnowledge();
        if (!index.byName.has('registerLuaCommand') || !index.retrieve('daily reward').length)
            throw new Error('Missing core APIs/retrieval');
        return `${index.entries.length} documented entries; index ready`;
    });
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.on('SIGINT', cancel);
    try {
        const config = await store.load();
        const credentials = await new CredentialStore(store).load();
        const registry = providerRegistry();
        for (const provider of providerIds) {
            const enabled = config.providers[provider].enabled && (config.providerMode === 'auto' || config.providerMode === provider);
            const keys = credentials.filter(c => c.provider === provider);
            if (!enabled) {
                output(`• ${provider}: disabled by provider settings`);
                continue;
            }
            if (!keys.length) {
                output(`⚠ ${provider}: no credentials configured`);
                continue;
            }
            output(`✓ ${provider}: ${keys.length} credentials detected`);
            let ready = false;
            for (const c of keys) {
                try {
                    if (!offline)
                        await registry[provider].testConnection(c.key, config.providers[provider].model, controller.signal);
                    ready = true;
                    break;
                }
                catch (error) {
                    if (error instanceof ProviderError && error.kind === 'aborted')
                        throw error;
                    output(`⚠ ${c.id}: ${error instanceof ProviderError ? error.message : 'Connection check failed.'}`);
                }
            }
            if (ready) {
                usable = true;
                output(`✓ ${provider}: ${offline ? 'configured (network check skipped)' : 'API reachable; model available'} (${config.providers[provider].model})`);
            }
            else
                output(`⚠ ${provider}: unavailable`);
        }
        if (!credentials.length)
            output('✗ No AI provider credentials configured');
    }
    catch (error) {
        if (error instanceof ProviderError && error.kind === 'aborted')
            throw error;
        critical = true;
        output('✗ ' + messageOf(error));
    }
    finally {
        process.off('SIGINT', cancel);
    }
    if (critical || !usable) {
        output('\nTern is not ready: no usable provider or critical local failure.');
        process.exitCode = 1;
    }
    else
        output(offline ? '\nLocal checks passed. Run tern doctor to check connectivity.' : '\nTern is ready using the available provider(s). Metadata checks do not guarantee generation quota.');
}
export async function status(live = false) {
    if (live) {
        await doctor();
        return;
    }
    const store = new ConfigStore();
    const config = await store.load();
    const credentials = await new CredentialStore(store).load();
    output(`Tern AI\nProvider mode: ${config.providerMode}`);
    for (const p of providerIds) {
        const count = credentials.filter(c => c.provider === p).length;
        output(`\n${p}\n  Model: ${config.providers[p].model}\n  Enabled: ${config.providers[p].enabled}\n  Keys: ${count}\n  Ready: ${count}\n  Cooldown: 0 (runtime state is process-local)`);
    }
    const index = await loadKnowledge();
    output(`\nGTPS API\n  Entries: ${index.entries.length}\n  Index: ready`);
}
//# sourceMappingURL=doctor.js.map