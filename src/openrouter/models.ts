import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { ConfigStore, DEFAULT_MODEL, privateJson } from '../config/store.js';
import { isMissing, record, TernError } from '../utils/errors.js';
import { OpenRouterClient } from './client.js';
export interface Model { id: string; name: string; free: boolean; contextLength: number }
export function parseModels(value: unknown): Model[] {
  if (!record(value) || !Array.isArray(value.data)) throw new TernError('Invalid OpenRouter model list.');
  return value.data.flatMap((entry: unknown): Model[] => {
    if (!record(entry) || typeof entry.id !== 'string' || !record(entry.pricing)) return [];
    if (record(entry.architecture) && Array.isArray(entry.architecture.output_modalities) && !entry.architecture.output_modalities.includes('text')) return [];
    const pricing = entry.pricing;
    const zero = (v: unknown): boolean => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '' && Number(v) === 0;
    const free = zero(pricing.prompt) && zero(pricing.completion) && Object.values(pricing).every(v => v === null || zero(v));
    return [{ id: entry.id, name: typeof entry.name === 'string' ? entry.name : entry.id, free,
      contextLength: typeof entry.context_length === 'number' ? entry.context_length : 0 }];
  });
}
export class ModelCatalog {
  constructor(private readonly store: ConfigStore, private readonly client: OpenRouterClient, private readonly warn: (text: string) => void) {}
  async list(refresh = false): Promise<Model[]> {
    let cache: { at: number; models: Model[] } | undefined;
    try {
      const raw: unknown = JSON.parse(await readFile(join(this.store.directory, 'models-cache.json'), 'utf8'));
      if (record(raw) && typeof raw.at === 'number' && Array.isArray(raw.models) && raw.models.every((m: unknown) => record(m) && typeof m.id === 'string' && typeof m.free === 'boolean' && typeof m.name === 'string' && typeof m.contextLength === 'number')) cache = raw as typeof cache;
    } catch (error) { if (!isMissing(error)) this.warn('Ignoring unreadable model cache; fetching a fresh list.'); }
    if (!refresh && cache && Date.now() - cache.at < 6 * 60 * 60 * 1000 && cache.at <= Date.now()) return cache.models;
    try {
      const models = parseModels(await this.client.get('/models'));
      if (!models.length) throw new TernError('OpenRouter returned an empty model list.');
      try { await this.store.prepare(); await privateJson(join(this.store.directory, 'models-cache.json'), { at: Date.now(), models }); }
      catch { this.warn('Could not persist model cache.'); }
      return models;
    } catch {
      if (cache) { this.warn('Could not fetch models from OpenRouter. Using cached model list.'); return cache.models; }
      this.warn('Could not fetch models from OpenRouter. Only the default free router is available.');
      return [{ id: DEFAULT_MODEL, name: 'Free Models Router', free: true, contextLength: 0 }];
    }
  }
}
