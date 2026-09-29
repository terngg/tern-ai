import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isProvider, providerIds, type ProviderMode, type ProviderId } from '../providers/types.js';
import { isMissing, record, TernError } from '../utils/errors.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_MODEL = 'openrouter/free';
export interface Config {
  providerMode: ProviderMode; providerPriority: ProviderId[]; providers: Record<ProviderId, {enabled:boolean;model:string}>;
  model: string; temperature: number; language: string; stream: boolean; maxRepairAttempts: number;
}
export const defaults: Readonly<Config> = {
  providerMode: 'auto', providerPriority: ['gemini','openrouter'],
  providers: {gemini:{enabled:true,model:DEFAULT_GEMINI_MODEL},openrouter:{enabled:true,model:DEFAULT_MODEL}},
  model: DEFAULT_MODEL, temperature: 0.2, language: 'auto', stream: true, maxRepairAttempts: 2,
};
export function configDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.TERN_CONFIG_DIR) return env.TERN_CONFIG_DIR;
  if (platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'tern-ai');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'tern-ai');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tern-ai');
}
export function validateConfig(input: unknown): Config {
  if (!record(input)) throw new TernError('Configuration must be an object.');
  const result = { ...structuredClone(defaults), ...structuredClone(input) };
  if(!['auto',...providerIds].includes(result.providerMode)) throw new TernError('providerMode must be auto, gemini, or openrouter.');
  if(!Array.isArray(result.providerPriority) || result.providerPriority.length!==2 || new Set(result.providerPriority).size!==2 || !result.providerPriority.every(isProvider)) throw new TernError('providerPriority must contain gemini and openrouter exactly once.');
  if(!record(result.providers) || Object.keys(result.providers).some(p=>!isProvider(p))) throw new TernError('Invalid providers configuration.');
  for(const p of providerIds) {
    const settings = result.providers[p];
    if(!record(settings) || Object.keys(settings).some(k=>!['enabled','model'].includes(k)) || typeof settings.enabled!=='boolean' || typeof settings.model!=='string' || !/^[\w.:/-]+$/.test(settings.model)) throw new TernError('Invalid provider settings.');
  }
  // Keep the legacy OpenRouter model property synchronized.
  if(!Object.hasOwn(input,'providers')) result.providers.openrouter.model=result.model;
  else result.model=result.providers.openrouter.model;
  for (const key of Object.keys(result)) if (!Object.hasOwn(defaults, key)) throw new TernError(`Unknown configuration key: ${key}`);
  if (typeof result.model !== 'string' || !/^[\w.-]+\/[\w.:/-]+$/.test(result.model)) throw new TernError('Model must be an OpenRouter provider/model ID.');
  if (typeof result.temperature !== 'number' || !Number.isFinite(result.temperature) || result.temperature < 0 || result.temperature > 2) throw new TernError('temperature must be between 0 and 2.');
  if (typeof result.language !== 'string' || !/^[\p{L} -]{2,40}$/u.test(result.language)) throw new TernError('language must be auto or a language name/code.');
  if (typeof result.stream !== 'boolean') throw new TernError('stream must be true or false.');
  if (!Number.isInteger(result.maxRepairAttempts) || result.maxRepairAttempts < 0 || result.maxRepairAttempts > 2) throw new TernError('maxRepairAttempts must be 0, 1, or 2.');
  return result as Config;
}
export async function privateJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temp, path);
    if (process.platform !== 'win32') await chmod(path, 0o600);
  } finally { await rm(temp, { force: true }); }
}
export class ConfigStore {
  constructor(public readonly directory = configDir()) {}
  async prepare(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await chmod(this.directory, 0o700);
  }
  async load(): Promise<Config> {
    try { return validateConfig(JSON.parse(await readFile(join(this.directory, 'config.json'), 'utf8')) as unknown); }
    catch (error) { if (isMissing(error)) return structuredClone(defaults); throw new TernError('Invalid config.json. Correct or remove the file in ' + this.directory); }
  }
  async set(key: string, value: unknown): Promise<Config> {
    const previous=await this.load();
    if(key==='model' && typeof value==='string') previous.providers.openrouter.model=value;
    const config = validateConfig({ ...previous, [key]: value });
    await this.prepare(); await privateJson(join(this.directory, 'config.json'), config); return config;
  }
  async credential(env: NodeJS.ProcessEnv = process.env): Promise<{ key: string; source: string } | undefined> {
    const { CredentialStore } = await import('./credentials.js');
    const c=(await new CredentialStore(this).load(env)).find(c=>c.provider==='openrouter');
    return c ? {key:c.key,source:c.source==='stored'?'local credential file':'environment'} : undefined;
  }
  async saveCredential(key: string): Promise<void> {
    const { CredentialStore } = await import('./credentials.js');
    await new CredentialStore(this).add('openrouter',key,{});
  }
  async setModel(provider: ProviderId, model: string): Promise<Config> {
    const config=await this.load();config.providers[provider].model=model;
    return this.set('providers',config.providers);
  }

  async logout(): Promise<void> {
    const { CredentialStore } = await import('./credentials.js');const store=new CredentialStore(this);
    for(const c of await store.load({}))if(c.provider==='openrouter')await store.remove(c.id);
  }
}
