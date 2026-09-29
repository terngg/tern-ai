import type { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import type { CompletionOptions } from '../openrouter/client.js';
import { retryAfter } from '../openrouter/errors.js';
import { record } from '../utils/errors.js';
import { httpKind, ProviderError } from './errors.js';
import type { AIProvider, ModelInfo } from './types.js';
export function geminiError(error:unknown,signal?:AbortSignal):ProviderError {
  if(signal?.aborted)return new ProviderError('aborted');
  if(error instanceof ProviderError)return error;
  const e=record(error)?error:{};
  if(e.name==='TimeoutError')return new ProviderError('timeout');
  let body:unknown=e;
  // SDK ApiError.message contains JSON; inspect it but never retain/print it.
  if(typeof e.message==='string') {try{body=JSON.parse(e.message);}catch{/* Non-JSON transport error. */}}
  const root=record(body)?body:{};const detail=record(root.error)?root.error:root;
  const status=Number(e.status || detail.code || 0);
  const message=typeof detail.message==='string'?detail.message.toLowerCase():'';
  let kind=httpKind(status);
  if(message.includes('api key not valid') || message.includes('api_key_invalid') || message.includes('invalid api key'))kind='auth';
  else if(message.includes('billing') || message.includes('payment required'))kind='billing';
  else if(detail.status==='RESOURCE_EXHAUSTED' || status===429)kind=message.includes('quota')?'quota':'rate_limit';
  else if(e.name==='AbortError')kind='timeout';
  else if(status===0)kind='network';
  let wait: number|undefined;
  if(record(e.headers) && typeof e.headers['retry-after']==='string')wait=retryAfter(e.headers['retry-after']);
  if(Array.isArray(detail.details))for(const d of detail.details)if(record(d) && typeof d.retryDelay==='string' && /^\d+(\.\d+)?s$/.test(d.retryDelay))wait=Number(d.retryDelay.slice(0,-1))*1000;
  return new ProviderError(kind,wait,status);
}
export class GeminiProvider implements AIProvider {
  readonly id='gemini' as const;
  constructor(private readonly factory?: (key:string)=>GoogleGenAI) {}
  private async create(key:string):Promise<GoogleGenAI> {
    if(this.factory)return this.factory(key);
    const {GoogleGenAI}=await import('@google/genai');
    return new GoogleGenAI({apiKey:key,httpOptions:{timeout:120_000,retryOptions:{attempts:1},fetch:async(url,init)=>{
      // Capture Retry-After before the SDK discards response headers, and never follow
      // redirects with credentials. Native SDK handles successful responses/streaming.
      const response=await fetch(url,{...init,redirect:'error'});
      if(response.status===429){
        const wait=retryAfter(response.headers.get('retry-after'));
        if(wait!==undefined){await response.body?.cancel();throw new ProviderError('rate_limit',wait);}
      }
      return response;
    }}});
  }
  async complete(key:string,request:CompletionOptions):Promise<string> {
    try {
      request.signal?.throwIfAborted();
      const params:GenerateContentParameters={model:request.model,
        contents:request.messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),
        config:{systemInstruction:request.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'),temperature:request.temperature,maxOutputTokens:8192,...(request.signal?{abortSignal:request.signal}:{})}};
      const models=(await this.create(key)).models;let output='';let finished=false;
      const consume=(chunk:GenerateContentResponse):void=>{
        if(chunk.promptFeedback?.blockReason && chunk.promptFeedback.blockReason!=='BLOCKED_REASON_UNSPECIFIED')throw new ProviderError('content_blocked');
        const reason=chunk.candidates?.[0]?.finishReason;
        if(reason==='MAX_TOKENS')throw new ProviderError('output_limit');
        if(reason && ['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII','IMAGE_SAFETY','IMAGE_PROHIBITED_CONTENT','IMAGE_RECITATION','ESCALATION','PUP_LIMITED_DISABLED'].includes(reason))throw new ProviderError('content_blocked');
        if(reason && reason!=='STOP' && reason!=='FINISH_REASON_UNSPECIFIED')throw new ProviderError('bad_request');
        if(reason==='STOP')finished=true;
        const text=chunk.text || '';output+=text;
        if(Buffer.byteLength(output)>262_144)throw new ProviderError('bad_request');
        if(text)request.onToken?.(text);
      };
      if(request.stream) {for await(const chunk of await models.generateContentStream(params)){request.signal?.throwIfAborted();consume(chunk);}}
      else consume(await models.generateContent(params));
      request.signal?.throwIfAborted();
      if(!finished)throw new ProviderError('incomplete_response');
      if(!output.trim())throw new ProviderError('empty_response');
      return output;
    }catch(error){throw geminiError(error,request.signal);}
  }
  async listModels(key:string,signal?:AbortSignal):Promise<ModelInfo[]> {
    try {
      const result:ModelInfo[]=[];
      for await(const m of await (await this.create(key)).models.list({config:{pageSize:100,...(signal?{abortSignal:signal}:{})}})) {
        if(m.name && (!m.supportedActions || m.supportedActions.includes('generateContent')))result.push({id:m.name.replace(/^models\//,''),name:m.displayName || m.name});
      }
      return result;
    }catch(error){throw geminiError(error,signal);}
  }
  async testConnection(key:string,model:string,signal?:AbortSignal):Promise<void> {
    try {await (await this.create(key)).models.get({model,config:{...(signal?{abortSignal:signal}:{})}});}
    catch(error){throw geminiError(error,signal);}
  }
}
