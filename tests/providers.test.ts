import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../src/config/credentials.js';
import { ConfigStore, defaults, validateConfig, type Config } from '../src/config/store.js';
import { ApiKeyPool } from '../src/providers/key-pool.js';
import { ProviderError } from '../src/providers/errors.js';
import { ProviderClient } from '../src/providers/fallback.js';
import { GeminiProvider, geminiError } from '../src/providers/gemini.js';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import { OpenRouterClient } from '../src/openrouter/client.js';
import type { AIProvider, Credential, ProviderId } from '../src/providers/types.js';
import type { CompletionOptions } from '../src/openrouter/client.js';
import { GoogleGenAI, GenerateContentResponse, type GenerateContentParameters } from '@google/genai';
import { maskKey, redact, registerSecrets } from '../src/utils/security.js';
import { Assistant } from '../src/commands/assistant.js';
import { loadKnowledge } from '../src/gtps/knowledge.js';
import { ModelCatalog } from '../src/openrouter/models.js';
const credential=(provider:ProviderId,n:number):Credential=>({provider,id:`${provider}-${n}`,key:`test-${provider}-secret-${n}`,source:'environment'});
const keys=[credential('gemini',1),credential('gemini',2),credential('gemini',3),credential('openrouter',1),credential('openrouter',2)];
const request:CompletionOptions={model:'ignored/legacy',messages:[{role:'system',content:'LOCAL GTPS RULES'},{role:'user',content:'print test'}],temperature:0.2,stream:true,free:true};
const mock=(id:ProviderId,fn:AIProvider['complete']):AIProvider=>({id,complete:fn,listModels:async()=>[],testConnection:async()=>undefined});

test('loads exact env prefixes, unlimited numbered keys, deduplication and stable IDs',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-keys-'));const store=new CredentialStore(new ConfigStore(dir));
  try {
    const first=await store.add('gemini','AIza-first-test-key-1234',{});
    const second=await store.add('gemini','AIza-second-test-key-5678',{});
    assert.equal(first.credential.id,'gemini-1');assert.equal(second.credential.id,'gemini-2');
    assert.equal((await store.add('gemini',second.credential.key,{})).duplicate,true);
    const env={GEMINI_API_KEY:first.credential.key,GEMINI_API_KEY_1:first.credential.key,GEMINI_API_KEY_2:second.credential.key,GEMINI_API_KEY_100:'large-number-secret',GEMINI_API_KEY_DEBUG:'ignore-me',X_GEMINI_API_KEY_3:'ignore-too',OPENROUTER_API_KEY:'legacy-openrouter-key',OPENROUTER_API_KEY_1:'legacy-openrouter-key',OPENROUTER_API_KEY_9:'another-router-key'};
    const loaded=await store.load(env);assert.equal(loaded.length,5);assert.equal(loaded[0]?.id,'gemini-1');assert.equal(loaded[0]?.source,'environment');
    assert.ok(!loaded.some(c=>c.key.includes('ignore')));
    await store.remove('gemini-1');assert.equal((await new CredentialStore(new ConfigStore(dir)).load({}))[0]?.id,'gemini-2');
    assert.equal((await store.add('gemini','AIza-third-test-key-9012',{})).credential.id,'gemini-3');
    await assert.rejects(()=>store.remove('gemini-env-1'));
    assert.equal((await store.load({})).length,2);
    if(process.platform!=='win32')assert.equal((await stat(join(dir,'credentials.json'))).mode&0o777,0o600);
    await new ConfigStore(dir).set('language','auto');assert.ok(!(await readFile(join(dir,'config.json'),'utf8')).includes('AIza'));
    for(const provider of ['GEMINI','OPENROUTER']) {
      assert.equal((await new CredentialStore(new ConfigStore(join(dir,'isolated'))).load({[`${provider}_API_KEY`]:'single-env-key'})).length,1);
      assert.equal((await new CredentialStore(new ConfigStore(join(dir,'isolated'))).load(Object.fromEntries(Array.from({length:30},(_,i)=>[`${provider}_API_KEY_${i+1}`,`env-key-${i}`])))).length,30);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('legacy credential and model migrate without losing values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-migrate-'));
  try {
    await writeFile(join(dir,'credentials.json'),JSON.stringify({key:'sk-or-legacy-test-1234'}));
    await writeFile(join(dir,'config.json'),JSON.stringify({model:'explicit/paid'}));
    const store=new ConfigStore(dir);assert.equal((await store.load()).providers.openrouter.model,'explicit/paid');
    const cs=new CredentialStore(store);assert.equal((await cs.load({}))[0]?.id,'openrouter-1');
    await cs.add('gemini','AIza-second-test-1234',{});assert.equal((await cs.load({})).length,2);
    await store.setModel('gemini','gemini-future');assert.equal((await store.load()).model,'explicit/paid');
    await store.set('model','other/free:free');assert.equal((await store.load()).providers.openrouter.model,'other/free:free');
    assert.throws(()=>validateConfig({...defaults,providerPriority:['gemini','gemini']}));
    assert.throws(()=>validateConfig({...defaults,providers:{...defaults.providers,gemini:{enabled:true,model:'okay',apiKey:'forbidden'}}}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('pool round-robin, concurrent reservations, cooldown Retry-After and invalid state',async()=>{
  let now=1000;const pool=new ApiKeyPool(keys,()=>now);
  assert.deepEqual([1,2,3,4].map(()=>pool.select('gemini')?.id),['gemini-1','gemini-2','gemini-3','gemini-1']);
  pool.failure('gemini-2',new ProviderError('auth'));pool.failure('gemini-2',new ProviderError('quota'));assert.equal(pool.snapshot()[1]?.status,'invalid');pool.failure('gemini-3',new ProviderError('rate_limit',60_000));
  assert.equal(pool.select('gemini')?.id,'gemini-1');now+=30_000;assert.equal(pool.snapshot()[2]?.status,'cooldown');
  now+=30_000;assert.equal(pool.snapshot()[2]?.status,'ready');assert.equal(pool.snapshot()[1]?.status,'invalid');
  const concurrent=new ApiKeyPool(keys);assert.deepEqual(await Promise.all([1,2,3].map(async()=>concurrent.select('gemini')?.id)),['gemini-1','gemini-2','gemini-3']);
  pool.failure('gemini-3',new ProviderError('quota'));assert.equal(pool.snapshot()[2]?.cooldownUntil,now+60_000);
  const modelPool=new ApiKeyPool(keys);modelPool.failure('gemini-1',new ProviderError('model_not_found'));assert.equal(modelPool.snapshot()[0]?.status,'ready');
});
test('all Gemini keys exhaust before OpenRouter, round robin and explicit paid-only selection',async()=>{
  const attempts:string[]=[];const models:string[]=[];
  const registry={gemini:mock('gemini',async key=>{attempts.push(key);throw new ProviderError('quota');}),openrouter:mock('openrouter',async(key,r)=>{attempts.push(key);models.push(r.model);return 'print("ok")';})};
  const config:Config=structuredClone(defaults);const pool=new ApiKeyPool(keys);const client=new ProviderClient(config,pool,registry);
  assert.equal(await client.complete(request),'print("ok")');
  assert.deepEqual(attempts,keys.slice(0,4).map(c=>c.key));assert.deepEqual(models,['openrouter/free']);
  await client.complete(request);assert.equal(attempts.at(-1),keys[4]?.key);
  config.providers.openrouter.model='explicit/paid';await client.complete(request);assert.equal(models.at(-1),'explicit/paid');
});
test('401 disables only affected key; 429 respects cooldown; model error skips provider; bad request stops',async()=>{
  for(const kind of ['auth','rate_limit','model_not_found','bad_request','billing','permission','timeout','network','server'] as const) {
    const calls:string[]=[];const pool=new ApiKeyPool(keys);
    const registry={gemini:mock('gemini',async key=>{calls.push(key);if(key===keys[0]?.key)throw new ProviderError(kind,100_000);return 'gemini';}),openrouter:mock('openrouter',async()=>{calls.push('router');return 'router';})};
    const client=new ProviderClient(structuredClone(defaults),pool,registry);
    if(kind==='bad_request'){await assert.rejects(()=>client.complete(request));assert.equal(calls.length,1);}
    else {assert.equal(await client.complete(request),kind==='model_not_found'?'router':'gemini');assert.equal(calls.length,2);}
    if(kind==='auth'){assert.equal(pool.snapshot()[0]?.status,'invalid');await client.complete(request);assert.equal(calls.filter(k=>k===keys[0]?.key).length,1);}
    if(kind==='rate_limit')assert.equal(pool.snapshot()[0]?.status,'cooldown');
    if(kind==='model_not_found')assert.equal(pool.snapshot()[0]?.status,'ready');
  }
});
test('bounded failure never discovers a paid fallback and forced provider stays forced',async()=>{
  for(const mode of ['auto','gemini','openrouter'] as const) {
    const config:Config=structuredClone(defaults);config.providerMode=mode;const models:string[]=[];
    const fail=async(_key:string,r:CompletionOptions):Promise<string>=>{models.push(r.model);throw new ProviderError('quota');};
    const client=new ProviderClient(config,new ApiKeyPool(keys),{gemini:mock('gemini',fail),openrouter:mock('openrouter',fail)});
    await assert.rejects(()=>client.complete(request),/Quota/);
    assert.equal(models.length,mode==='auto'?5:mode==='gemini'?3:2);
    assert.ok(models.every(m=>m===config.providers.gemini.model || m==='openrouter/free'));
    await assert.rejects(()=>client.complete(request),/No usable/);
  }
});
test('stream retries discard partial transaction, redact split secrets, and abort stops all fallback',async()=>{
  const secret='test-custom-secret-very-long-9988';registerSecrets([secret]);const statuses:string[]=[];const visible:string[]=[];let count=0;
  const registry={gemini:mock('gemini',async(_key,r)=>{count++;if(count===1){r.onToken?.('BROKEN'.repeat(150));throw new ProviderError('network');}for(const t of ['a'.repeat(550),secret.slice(0,10),secret.slice(10),'b'.repeat(550)])r.onToken?.(t);return 'print("ok")';}),openrouter:mock('openrouter',async()=>{throw new Error('Should not fallback');})};
  const client=new ProviderClient(structuredClone(defaults),new ApiKeyPool(keys),registry,s=>statuses.push(s),true);
  assert.equal(await client.complete({...request,onToken:t=>visible.push(t)}),'print("ok")');
  assert.ok(statuses.some(s=>s.includes('Partial draft discarded')));assert.ok(!visible.join('').includes(secret));assert.ok(!statuses.join('').includes(secret));
  const controller=new AbortController();count=0;
  registry.gemini=mock('gemini',async()=>{count++;controller.abort();throw new ProviderError('network');});
  await assert.rejects(()=>client.complete({...request,signal:controller.signal}),/cancelled/);assert.equal(count,1);
  assert.ok(!redact(`x-goog-api-key: ${secret} https://host?key=${secret} Authorization: Bearer ${secret}`).includes(secret));
  assert.equal(maskKey('AIza-long-secret-1234'),'AIza****1234');
});
test('Gemini SDK mapping uses systemInstruction, history, abort signal, streaming and model APIs',async()=>{
  let params:GenerateContentParameters|undefined;let getModel='';const controller=new AbortController();
  const chunk=(text:string,finish=false):GenerateContentResponse=>Object.assign(new GenerateContentResponse(),{candidates:[{content:{parts:[{text}]},...(finish?{finishReason:'STOP'}:{})}]});
  const sdk={models:{
    generateContentStream:async(p:GenerateContentParameters)=>{params=p;return (async function*(){yield chunk('print(');yield chunk('"ok")',true);})();},
    generateContent:async(p:GenerateContentParameters)=>{params=p;return chunk('plain',true);},
    list:async()=> (async function*(){yield {name:'models/gemini-test',supportedActions:['generateContent']};yield {name:'models/embedding',supportedActions:['embedContent']};})(),
    get:async({model}:{model:string})=>{getModel=model;return {};},
  }} as unknown as GoogleGenAI;
  const provider=new GeminiProvider(()=>sdk);const tokens:string[]=[];
  assert.equal(await provider.complete('hidden',{...request,model:'gemini-test',messages:[...request.messages,{role:'assistant',content:'previous'},{role:'user',content:'follow up'}],signal:controller.signal,onToken:t=>tokens.push(t)}),'print("ok")');
  assert.equal(tokens.length,2);assert.equal(params?.config?.systemInstruction,'LOCAL GTPS RULES');assert.equal(params?.config?.abortSignal,controller.signal);
  assert.equal((params?.contents as Array<{role:string}>)[1]?.role,'model');
  assert.deepEqual(await provider.listModels('hidden'),[{id:'gemini-test',name:'models/gemini-test'}]);
  await provider.testConnection('hidden','gemini-test');assert.equal(getModel,'gemini-test');
  assert.equal(await provider.complete('hidden',{...request,stream:false}),'plain');
  sdk.models.generateContentStream=async()=> (async function*(){yield chunk('partial');})();
  await assert.rejects(()=>provider.complete('hidden',request),/incomplete/);
});
test('provider-specific errors are normalized and never retain raw key/body',async()=>{
  const secret='AIza-secret-sensitive-9876';
  const e=geminiError({status:429,message:JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message:`quota ${secret}`,details:[{retryDelay:'90s'}]}})});
  assert.equal(e.kind,'quota');assert.equal(e.retryAfterMs,90_000);assert.ok(!JSON.stringify(e).includes(secret));assert.ok(!e.message.includes(secret));
  assert.equal(geminiError({status:400,message:JSON.stringify({error:{message:'API key not valid'}})}).kind,'auth');
  assert.equal(geminiError({status:404}).kind,'model_not_found');assert.equal(geminiError({status:403}).kind,'permission');
  const provider=new OpenRouterProvider(key=>new OpenRouterClient(key,async()=>Response.json({error:{message:secret}},{status:401})));
  await assert.rejects(()=>provider.complete(secret,request),(error:unknown)=>error instanceof ProviderError && error.kind==='auth' && !error.message.includes(secret));
});
test('validation repair crosses providers retaining generated code, validation and authoritative context',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-repair-providers-'));let calls=0;let repaired:CompletionOptions|undefined;
  try {
    const config:Config=structuredClone(defaults);const registry={gemini:mock('gemini',async()=>{if(++calls===1)return '```lua\nplayer:addWorldLock(5)\n```';throw new ProviderError('quota');}),openrouter:mock('openrouter',async(_k,r)=>{repaired=r;return '```lua\nprint("valid")\n```';})};
    const client=new ProviderClient(config,new ApiKeyPool([keys[0]!,keys[3]!]),registry);
    const assistant=new Assistant(config,await loadKnowledge(),client,new ModelCatalog(new ConfigStore(dir),new OpenRouterClient(''),()=>undefined),'',()=>undefined);
    const result=await assistant.run({task:'generate',prompt:'buat bank',files:[],history:[{role:'user',content:'buat bank'},{role:'assistant',content:'previous bank script'}]});
    assert.equal(result.code,'print("valid")');assert.equal(result.model,'openrouter/free');
    const context=repaired?.messages.map(m=>m.content).join('\n') || '';assert.match(context,/addWorldLock/);assert.match(context,/Validation failures/);assert.match(context,/previous bank script/);assert.match(context,/registerLuaCommand/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Gemini incomplete buffered stream recovers once with the same key and JSON; no partial output leaks',async()=>{
  const attempts:Array<{key:string;stream:boolean}>=[];const statuses:string[]=[];
  const provider=mock('gemini',async(key,r)=>{
    attempts.push({key,stream:r.stream});
    if(r.stream){r.onToken?.('BROKEN_PARTIAL_RESPONSE');throw new ProviderError('incomplete_response');}
    return 'print("complete")';
  });
  const config:Config=structuredClone(defaults);config.providerMode='gemini';
  const client=new ProviderClient(config,new ApiKeyPool(keys),{gemini:provider,openrouter:mock('openrouter',async()=>assert.fail('forced mode'))},s=>statuses.push(s));
  assert.equal(await client.complete(request),'print("complete")');
  assert.deepEqual(attempts,[{key:keys[0]!.key,stream:true},{key:keys[0]!.key,stream:false}]);
  assert.ok(statuses.some(s=>s.includes('once without streaming')));assert.equal(config.stream,true);
  assert.equal(client.pool.snapshot()[0]?.status,'ready');
});
test('Gemini stream recovery budget is per request; abort, visible streaming, and Retry-After skip recovery',async()=>{
  for(const scenario of ['repeated','abort','visible','wait','auth','quota'] as const){
    let calls=0;const controller=new AbortController();const streams:boolean[]=[];
    const config:Config=structuredClone(defaults);config.providerMode='gemini';
    const provider=mock('gemini',async(_key,r)=>{
      calls++;streams.push(r.stream);if(scenario==='abort')controller.abort();
      r.onToken?.('partial');throw new ProviderError(scenario==='auth'?'auth':scenario==='quota'?'quota':'incomplete_response',scenario==='wait'?60_000:undefined);
    });
    const client=new ProviderClient(config,new ApiKeyPool(keys.slice(0,2)),{gemini:provider,openrouter:mock('openrouter',async()=>assert.fail('forced'))});
    await assert.rejects(()=>client.complete({...request,signal:controller.signal,...(scenario==='visible'?{onToken:()=>undefined}:{})}),scenario==='abort'?/cancelled/:/Provider mode: gemini/);
    assert.equal(calls,scenario==='repeated'?3:scenario==='abort'?1:2,scenario);
    assert.equal(streams.filter(s=>!s).length,scenario==='repeated'?1:0,scenario);
  }
});
test('Gemini terminal states distinguish truncation, empty output, token limit and filtering',async()=>{
  for(const [reason,hasText,kind] of [[undefined,true,'incomplete_response'],['STOP',false,'empty_response'],['MAX_TOKENS',true,'output_limit'],['SAFETY',false,'content_blocked'],['STOP',true,'success']] as const){
    const response=Object.assign(new GenerateContentResponse(),{candidates:[{content:{parts:[{text:hasText?'print("ok")':''}]},...(reason?{finishReason:reason}:{})}]});
    const sdk={models:{generateContentStream:async()=> (async function*(){yield response;})(),generateContent:async()=>response}} as unknown as GoogleGenAI;
    const provider=new GeminiProvider(()=>sdk);
    for(const stream of [true,false]){
      if(kind==='success')assert.equal(await provider.complete('hidden',{...request,stream}),'print("ok")');
      else await assert.rejects(()=>provider.complete('hidden',{...request,stream}),(e:unknown)=>e instanceof ProviderError && e.kind===kind);
    }
  }
  const response=Object.assign(new GenerateContentResponse(),{promptFeedback:{blockReason:'SAFETY'}});
  const sdk={models:{generateContent:async()=>response}} as unknown as GoogleGenAI;
  await assert.rejects(()=>new GeminiProvider(()=>sdk).complete('hidden',{...request,stream:false}),(e:unknown)=>e instanceof ProviderError && e.kind==='content_blocked');
  const server=geminiError({status:503,message:'untrusted secret upstream body'});assert.match(server.message,/HTTP 503/);assert.ok(!server.message.includes('untrusted'));
});
test('output limit and content filtering stop without rotating or disabling credentials',async()=>{
  for(const kind of ['output_limit','content_blocked'] as const){
    let calls=0;const pool=new ApiKeyPool(keys);
    const client=new ProviderClient(structuredClone(defaults),pool,{gemini:mock('gemini',async()=>{calls++;throw new ProviderError(kind);}),openrouter:mock('openrouter',async()=>assert.fail('must stop'))});
    await assert.rejects(()=>client.complete(request),(e:unknown)=>e instanceof ProviderError && e.kind===kind);assert.equal(calls,1);assert.equal(pool.snapshot()[0]?.status,'ready');
  }
});
