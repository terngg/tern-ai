import test from 'node:test';
import assert from 'node:assert/strict';
import { SSEParser } from '../src/openrouter/sse.js';
import { OpenRouterClient, contentFromResponse, RouterError, type CompletionOptions } from '../src/openrouter/client.js';
import { parseModels, ModelCatalog } from '../src/openrouter/models.js';
import { ConfigStore } from '../src/config/store.js';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const options:CompletionOptions={model:'openrouter/free',messages:[{role:'user',content:'hello'}],temperature:0.2,stream:true,free:true};
function streamed(text:string,bytewise=false):Response {
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({start(c){if(bytewise)for(const b of bytes)c.enqueue(Uint8Array.of(b));else c.enqueue(bytes);c.close();}}),{headers:{'content-type':'text/event-stream'}});
}
const data=(text:string):string=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]})+'\n\n';
test('SSE arbitrary chunk boundaries, comments, CRLF, multiline and usage',()=>{
  const messages:string[]=[];const parser=new SSEParser(s=>messages.push(s));
  for(const char of ': keepalive\r\ndata: one\r\ndata: two\r\n\r\ndata: [DONE]\n\n')parser.feed(char);
  assert.deepEqual(messages,['one\ntwo','[DONE]']);
  parser.feed('data: incomplete');parser.feed('',true);assert.equal(messages.length,2);
});
test('stream UTF-8 and realtime chunks, exact Authorization header and free cap',async()=>{
  let body:Record<string,unknown>={};let auth='';let count=0;
  const fetcher:typeof fetch=async(_url,init)=>{body=JSON.parse(String(init?.body)) as Record<string,unknown>;auth=new Headers(init?.headers).get('Authorization') || '';return streamed(': comment\n\n'+data('local nama="雪"\n')+data('print(nama)')+'data: {"choices":[],"usage":{}}\n\ndata: [DONE]\n\n',true);};
  const client=new OpenRouterClient('test-secret',fetcher);
  assert.equal(await client.complete({...options,onToken:()=>count++}),'local nama="雪"\nprint(nama)');
  assert.equal(count,2);assert.equal(auth,'Bearer test-secret');assert.ok(!JSON.stringify(body).includes('test-secret'));
  assert.deepEqual(body.provider,{max_price:{prompt:0,completion:0,request:0,image:0}});
});
test('malformed, truncated, empty, midstream error, finish length, HTTP errors',async()=>{
  for(const text of ['data: nope\n\n',data('partial'),'data: [DONE]\n\n','data: {"error":{"code":429},"choices":[]}\n\n', 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n']){
    await assert.rejects(()=>new OpenRouterClient('key',async()=>streamed(text)).complete(options));
  }
  for(const status of [401,402,429,500,503])await assert.rejects(()=>new OpenRouterClient('key',async()=>new Response('',{status})).complete(options),e=>e instanceof RouterError && e.status===status);
  await assert.rejects(()=>new OpenRouterClient('key',async()=>{throw new TypeError('network disconnect');}).complete(options),/disconnected/);
});
test('timeout and caller abort are distinguishable',async()=>{
  const fetcher:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
    if(init?.signal?.aborted)reject(init.signal.reason);
    else init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true});
  });
  const keepAlive=setTimeout(()=>undefined,1000);
  try {
    await assert.rejects(()=>new OpenRouterClient('key',fetcher,10).complete(options),/timed out/);
    const controller=new AbortController();controller.abort();
    await assert.rejects(()=>new OpenRouterClient('key',fetcher).complete({...options,signal:controller.signal}),/cancelled/);
  }finally{clearTimeout(keepAlive);}
});
test('nonstream response and model pricing metadata',()=>{
  assert.equal(contentFromResponse({choices:[{message:{content:'Lua'},finish_reason:'stop'}]}).text,'Lua');
  const models=parseModels({data:[{id:'free-without-suffix',pricing:{prompt:'0',completion:'0',request:'0'}},{id:'misleading:free',pricing:{prompt:'0',completion:'0.01'}},{id:'missing-price:free',pricing:{prompt:'0'}},{id:'fee:free',pricing:{prompt:'0',completion:'0',request:'1'}}]});
  assert.deepEqual(models.filter(m=>m.free).map(m=>m.id),['free-without-suffix']);
  assert.deepEqual(parseModels({data:[{id:'audio/model',pricing:{prompt:'0',completion:'0'},architecture:{output_modalities:['audio']}}]}),[]);
});
test('model cache TTL and stale offline fallback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-models-'));let calls=0;const warnings:string[]=[];
  const client=new OpenRouterClient('',async()=>{calls++;return Response.json({data:[{id:'p/free',pricing:{prompt:'0',completion:'0'}}]});});
  try{
    const catalog=new ModelCatalog(new ConfigStore(dir),client,s=>warnings.push(s));await catalog.list();await catalog.list();assert.equal(calls,1);
    const offline=new ModelCatalog(new ConfigStore(dir),new OpenRouterClient('',async()=>{throw new Error('offline');}),s=>warnings.push(s));
    assert.equal((await offline.list(true))[0]?.id,'p/free');assert.match(warnings.join(' '),/cached/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('HTTP errors retain status and a redacted message, never provider metadata or HTML',async()=>{
  const key='private-test-credential';
  const client=new OpenRouterClient(key,async()=>Response.json({error:{code:400,message:`Invalid routing parameter. ${key} Authorization: Bearer abc123`,metadata:{raw:'never-expose-this'}}},{status:400}));
  await assert.rejects(()=>client.complete(options),error=>{
    assert.ok(error instanceof RouterError);assert.equal(error.status,400);
    assert.match(error.message,/HTTP 400/);assert.match(error.message,/Invalid routing parameter/);
    for(const secret of [key,'abc123','never-expose-this'])assert.ok(!error.message.includes(secret));
    return true;
  });
  await assert.rejects(()=>new OpenRouterClient(key,async()=>new Response('<html>secret-proxy-page</html>',{status:502,headers:{'content-type':'text/html'}})).complete(options),error=>{
    assert.ok(error instanceof RouterError);assert.equal(error.status,502);assert.ok(!error.message.includes('secret-proxy-page'));return true;
  });
});
test('stream requests understand JSON error envelopes and completed JSON responses',async()=>{
  for(const status of [401,402,429,503]) {
    await assert.rejects(()=>new OpenRouterClient('key',async()=>Response.json({error:{code:status,message:'Specific provider error'}})).complete(options),error=>error instanceof RouterError && error.status===status && error.message.includes('Specific provider error'));
  }
  const chunks:string[]=[];
  const client=new OpenRouterClient('key',async()=>Response.json({choices:[{message:{content:'print("ok")'},finish_reason:'stop'}]}));
  assert.equal(await client.complete({...options,onToken:t=>chunks.push(t)}),'print("ok")');assert.deepEqual(chunks,['print("ok")']);
});
test('SSE finish frames can omit delta; repeated usage finishes and text parts are accepted',async()=>{
  const reply=data('print("ok")')+'data: {"choices":[{"finish_reason":"stop"}]}\n\n'+'data: {"choices":[{"delta":null,"finish_reason":"stop"}],"usage":{"total_tokens":4}}\n\ndata: [DONE]\n\n';
  assert.equal(await new OpenRouterClient('key',async()=>streamed(reply,true)).complete(options),'print("ok")');
  assert.equal(contentFromResponse({choices:[{message:{content:[{type:'text',text:'print('},{type:'text',text:'1)'}]}}]}).text,'print(1)');
});
test('protocol failures are distinguishable from transport and preserve useful provider errors',async()=>{
  for(const [payload,pattern] of [
    ['data: invalid-json\n\n',/malformed JSON/],
    [data('print(1)'),/before \[DONE\]/],
    ['data: [DONE]\n\n',/no response text/],
  ] as const) {
    await assert.rejects(()=>new OpenRouterClient('key',async()=>streamed(payload)).complete(options),error=>error instanceof RouterError && error.kind==='protocol' && pattern.test(error.message));
  }
  await assert.rejects(()=>new OpenRouterClient('key',async()=>{throw new TypeError('fetch failed',{cause:Object.assign(new Error('private error'),{code:'EAI_AGAIN'})});}).complete(options),error=>{
    assert.ok(error instanceof RouterError);assert.equal(error.kind,'network');assert.match(error.message,/DNS/);assert.ok(!error.message.includes('private error'));return true;
  });
  await assert.rejects(()=>new OpenRouterClient('secret',async()=>streamed('data: {"error":{"code":"rate_limit_exceeded","message":"Quota exhausted secret"},"choices":[]}\n\n')).complete(options),error=>{
    assert.ok(error instanceof RouterError);assert.equal(error.status,429);assert.match(error.message,/Quota exhausted/);assert.ok(!error.message.includes('secret'));return true;
  });
});
test('Retry-After is parsed and kept on HTTP errors',async()=>{
  const {retryAfter}=await import('../src/openrouter/errors.js');
  assert.equal(retryAfter('2'),2000);assert.equal(retryAfter('0'),0);assert.equal(retryAfter('-1'),undefined);
  assert.equal(retryAfter('not a date'),undefined);
  assert.equal(retryAfter('Tue, 01 Jan 2030 00:00:02 GMT',Date.parse('2030-01-01T00:00:00Z')),2000);
  await assert.rejects(()=>new OpenRouterClient('key',async()=>Response.json({error:{code:429,message:'Quota exhausted'}},{status:429,headers:{'retry-after':'60'}})).complete(options),error=>{
    assert.ok(error instanceof RouterError);assert.equal(error.retryAfterMs,60000);assert.match(error.message,/60 seconds/);return true;
  });
});
