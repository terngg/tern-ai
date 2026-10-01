import { CredentialStore } from '../config/credentials.js';
import { ConfigStore } from '../config/store.js';
import { info, output, question, secretPrompt } from '../cli/io.js';
import { maskKey } from '../utils/security.js';
import { TernError } from '../utils/errors.js';
import { isProvider, providerIds } from '../providers/types.js';
import { providerRegistry } from '../providers/registry.js';
import { ProviderError } from '../providers/errors.js';
export function providerId(value) { if (!isProvider(value))
    throw new TernError('Provider must be gemini or openrouter.'); return value; }
export async function addCredential(provider) {
    const id = providerId(provider);
    const result = await new CredentialStore().add(id, await secretPrompt(id));
    output(result.duplicate ? `This credential is already registered as ${result.credential.id}.` : `✓ Added ${result.credential.id}`);
}
export async function listCredentials() {
    const credentials = await new CredentialStore().load();
    output('Credentials');
    for (const provider of providerIds) {
        output('\n' + (provider === 'gemini' ? 'Gemini' : 'OpenRouter'));
        for (const c of credentials.filter(c => c.provider === provider))
            output(`  ${c.id.padEnd(25)} ${maskKey(c.key)}  ready (${c.source})`);
        if (!credentials.some(c => c.provider === provider))
            output('  No credentials configured');
    }
    info('Runtime cooldown/invalid state resets when the CLI exits. Use auth test to check credentials.');
}
export async function removeCredential(id, yes = false) {
    if (!yes && (await question(`Remove ${id}? [y/N] `)).toLowerCase() !== 'y') {
        output('Cancelled.');
        return;
    }
    await new CredentialStore().remove(id);
    output('✓ Removed ' + id);
}
export async function testCredentials(target) {
    const store = new ConfigStore();
    const config = await store.load();
    const credentials = (await new CredentialStore(store).load()).filter(c => !target || c.provider === target || c.id === target);
    if (!credentials.length)
        throw new TernError('No matching credentials configured.');
    const registry = providerRegistry();
    output('Testing credentials (metadata only; no generation)...');
    let failed = false;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.on('SIGINT', cancel);
    try {
        for (const c of credentials) {
            try {
                await registry[c.provider].testConnection(c.key, config.providers[c.provider].model, controller.signal);
                output('✓ ' + c.id);
            }
            catch (error) {
                if (error instanceof ProviderError && error.kind === 'aborted')
                    throw error;
                failed = true;
                output(`✗ ${c.id}  ${error instanceof ProviderError ? error.message : 'Connection check failed.'}`);
            }
        }
    }
    finally {
        process.off('SIGINT', cancel);
    }
    if (failed)
        process.exitCode = 1;
}
export async function authMenu() {
    output('Tern Credentials\n1. Add Gemini API key\n2. Add OpenRouter API key\n3. List credentials\n4. Test credentials\n5. Remove credential');
    const choice = await question('Choose [1-5]: ');
    if (choice === '1' || choice === '2')
        await addCredential(choice === '1' ? 'gemini' : 'openrouter');
    else if (choice === '3')
        await listCredentials();
    else if (choice === '4')
        await testCredentials();
    else if (choice === '5')
        await removeCredential(await question('Credential ID: '));
    else
        throw new TernError('Choose an option from 1 to 5.');
}
//# sourceMappingURL=credentials.js.map