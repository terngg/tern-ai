import { ConfigStore, type Config } from '../config/store.js';
import { loadKnowledge, type ApiIndex } from '../gtps/knowledge.js';
import { OpenRouterClient } from '../openrouter/client.js';
import { ModelCatalog } from '../openrouter/models.js';
import { TernError } from '../utils/errors.js';
import { Assistant } from './assistant.js';
import { CredentialStore } from '../config/credentials.js';
import { ApiKeyPool } from '../providers/key-pool.js';
import { ProviderClient } from '../providers/fallback.js';
import { providerRegistry } from '../providers/registry.js';
import { warn } from '../cli/io.js';
export interface Runtime { store:ConfigStore; config:Config; key:string; index:ApiIndex; client:ProviderClient; catalog:ModelCatalog }
export async function runtime(requireKey=true):Promise<Runtime> {
  const store=new ConfigStore(); const config=await store.load(); const credentials=await new CredentialStore(store).load();
  const client=new ProviderClient(config,new ApiKeyPool(credentials),providerRegistry());
  if(requireKey && !credentials.some(c=>client.order().includes(c.provider))) throw new TernError('Welcome to Tern AI.\n\nNo AI provider credentials configured for the selected providers.\nRun tern auth add gemini or tern auth add openrouter, or set GEMINI_API_KEY / OPENROUTER_API_KEY.');
  const key=credentials.find(c=>c.provider==='openrouter')?.key || '';
  return {store,config,key,client,index:await loadKnowledge(),catalog:new ModelCatalog(store,new OpenRouterClient(key),warn)};
}
export function assistant(rt:Runtime,onStatus:(message:string)=>void):Assistant {
  rt.client.config=rt.config;rt.client.status=onStatus;rt.client.verbose=verboseMode;
  return new Assistant(rt.config,rt.index,rt.client,rt.catalog,rt.key,onStatus);
}

let verboseMode=false;
export function setVerbose(value:boolean):void { verboseMode=value; }

export function verboseEnabled():boolean { return verboseMode; }
