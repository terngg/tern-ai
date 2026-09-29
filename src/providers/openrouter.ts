import { OpenRouterClient, RouterError, type CompletionOptions } from '../openrouter/client.js';
import { parseModels } from '../openrouter/models.js';
import { TernError } from '../utils/errors.js';
import { httpKind, ProviderError } from './errors.js';
import type { AIProvider, ModelInfo } from './types.js';
export class OpenRouterProvider implements AIProvider {
  readonly id='openrouter' as const;
  constructor(private readonly create:(key:string)=>OpenRouterClient=key=>new OpenRouterClient(key)) {}
  private async call<T>(fn:()=>Promise<T>,signal?:AbortSignal):Promise<T> {
    try {return await fn();} catch(error) {
      if(signal?.aborted || error instanceof TernError && error.exitCode===130)throw new ProviderError('aborted');
      if(error instanceof ProviderError)throw error;
      if(error instanceof RouterError)throw new ProviderError(error.kind==='network'?'network':error.kind==='timeout'?'timeout':httpKind(error.status),error.retryAfterMs,error.status);
      throw new ProviderError('unknown');
    }
  }
  complete(key:string,request:CompletionOptions):Promise<string> { return this.call(()=>this.create(key).complete(request),request.signal); }
  listModels(key:string,signal?:AbortSignal):Promise<ModelInfo[]> { return this.call(async()=>parseModels(await this.create(key).get('/models',signal)),signal); }
  testConnection(key:string,model:string,signal?:AbortSignal):Promise<void> {
    return this.call(async()=>{
      await this.create(key).get('/key',signal);
      const models=await this.listModels(key,signal);
      if(!models.some(m=>m.id===model))throw new ProviderError('model_not_found');
    },signal);
  }
}
