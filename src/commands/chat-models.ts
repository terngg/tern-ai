import type { Runtime } from './runtime.js';
import { info, output } from '../cli/io.js';
import { DEFAULT_MODEL } from '../config/store.js';
import { ProviderError } from '../providers/errors.js';
import { providerRegistry } from '../providers/registry.js';
import { isProvider, type ModelInfo, type ProviderId } from '../providers/types.js';
import { TernError } from '../utils/errors.js';
const usage='Usage: /model [number | model-id | gemini <model-id> | openrouter <model-id>]';
/** The displayed list belongs to this session; numbers always refer to that exact list. */
export class ChatModels {
  private selection: {provider:ProviderId;models:ModelInfo[]}|undefined;
  constructor(private readonly rt:Runtime) {}
  private defaultProvider():ProviderId {
    const {config,client}=this.rt;
    if(config.providerMode!=='auto')return config.providerMode;
    const keys=client.pool.snapshot();
    return config.providerPriority.find(p=>config.providers[p].enabled && keys.some(c=>c.provider===p)) || config.providerPriority[0]!;
  }
  async list(name?:string,signal?:AbortSignal):Promise<void> {
    if(name && !isProvider(name))throw new TernError('Usage: /models [gemini | openrouter]');
    const provider=isProvider(name)?name:this.defaultProvider();this.selection=undefined;
    let models:ModelInfo[]=[];
    if(provider==='openrouter')models=(await this.rt.catalog.list()).filter(m=>m.free);
    else {
      const keys=this.rt.client.pool.snapshot().filter(c=>c.provider===provider && c.status==='ready');
      if(!keys.length)throw new TernError('No ready Gemini credential. Run tern auth add gemini or wait for cooldown. You can still set a model directly with /model gemini <model-id>.');
      const adapter=providerRegistry().gemini;let last:unknown;
      for(const c of keys){
        signal?.throwIfAborted();
        try{models=await adapter.listModels(c.key,signal);last=undefined;break;}
        catch(error){
          if(signal?.aborted || error instanceof ProviderError && ['aborted','bad_request'].includes(error.kind))throw error;
          if(error instanceof ProviderError)this.rt.client.pool.failure(c.id,error);
          last=error;
        }
      }
      if(last)throw last;
    }
    signal?.throwIfAborted();
    models=[...new Map(models.map(m=>[m.id,m])).values()];
    if(!models.length)throw new TernError(`No ${provider} models found. Set an ID directly with /model ${provider} <model-id>.`);
    const current=this.rt.config.providers[provider].model;
    this.selection={provider,models};
    output(`${provider==='gemini'?'Gemini':'OpenRouter'} models${provider==='openrouter'?' (free)':''}\nCurrent: ${current}`);
    models.forEach((m,i)=>output(`  ${i+1}. ${m.id}${m.id===current?' (current)':''}`));
    output('Choose: /model <number> or /model <model-id>');
  }
  async model(arg:string,signal?:AbortSignal):Promise<void> {
    const parts=arg.trim().split(/\s+/).filter(Boolean);
    if(!parts.length){
      output(`Provider mode: ${this.rt.config.providerMode}\nGemini: ${this.rt.config.providers.gemini.model}\nOpenRouter: ${this.rt.config.providers.openrouter.model}`);
      await this.list(undefined,signal);return;
    }
    const first=parts[0]!;
    if(parts.length===1 && isProvider(first)){await this.list(first,signal);return;}
    let provider:ProviderId;let id:string;
    if(parts.length===1 && /^\d+$/.test(first)){
      const model=this.selection?.models[Number(first)-1];
      if(!this.selection || !model)throw new TernError('Invalid model number. Run /model to see the available choices.');
      provider=this.selection.provider;id=model.id;
    }else if(parts.length===2 && isProvider(first)){
      provider=first;id=parts[1]!;
    }else if(parts.length===1){
      id=first;
      provider=/^(?:models\/)?gemini-/.test(id)?'gemini':id.includes('/')?'openrouter':this.defaultProvider();
    }else throw new TernError(usage);
    if(provider==='gemini')id=id.replace(/^models\//,'');
    signal?.throwIfAborted();
    this.rt.config=await this.rt.store.setModel(provider,id);
    this.rt.client.config=this.rt.config;
    info(`✓ ${provider} model: ${id} (saved; applies to the next request)`);
    if(provider==='openrouter' && id!==DEFAULT_MODEL && !id.endsWith(':free'))info('This explicitly selected OpenRouter model may incur charges.');
    if(!this.rt.config.providers[provider].enabled)info(`${provider} is disabled in configuration.`);
    else if(this.rt.config.providerMode!=='auto' && this.rt.config.providerMode!==provider)info(`Provider mode is ${this.rt.config.providerMode}. To use ${provider}, run: tern provider set ${provider}`);
  }
}
