import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Assistant } from '../src/commands/assistant.js';
import { ConfigStore, defaults } from '../src/config/store.js';
import { OpenRouterClient } from '../src/openrouter/client.js';
import { ModelCatalog } from '../src/openrouter/models.js';
import { loadKnowledge } from '../src/gtps/knowledge.js';
const index=await loadKnowledge();
const reply=(code:string):Response=>Response.json({choices:[{message:{content:'```lua\n'+code+'\n```'},finish_reason:'stop'}]});
test('unknown API repair is bounded and corrected code revalidated',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-repair-'));let calls=0;const requests:string[]=[];
  const client=new OpenRouterClient('test-key',async(_url,init)=>{requests.push(String(init?.body));return reply(++calls===1?'player:addWorldLock(5)':'player:giveItem(242,5)');});
  try{
    const assistant=new Assistant({...defaults,stream:false},index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),'test-key',()=>undefined);
    const result=await assistant.run({task:'generate',prompt:'buat daily',files:[]});
    assert.equal(calls,2);assert.equal(result.code,'player:giveItem(242,5)');assert.deepEqual(result.validation?.findings,[]);
    assert.match(requests[1] || '',/Unknown GTPS API/);
    assert.ok(!requests.join('').includes('test-key'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('failed repair stops at exactly two additional requests',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-limit-'));let calls=0;
  const client=new OpenRouterClient('',async()=>{calls++;return reply('sendConsole("bad")');});
  try{
    const assistant=new Assistant({...defaults,stream:false},index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),'',()=>undefined);
    const result=await assistant.run({task:'generate',prompt:'buat command',files:[]});
    assert.equal(calls,3);assert.ok(result.validation?.findings.some(f=>f.code==='unknown'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('free fallback goes only to default; auth errors do not retry',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-fallback-'));const selected:string[]=[];
  let status=429;
  const fetcher:typeof fetch=async(url,init)=>{
    if(String(url).endsWith('/models'))return Response.json({data:[{id:'provider/example:free',pricing:{prompt:'0',completion:'0'}}]});
    const body=JSON.parse(String(init?.body)) as {model:string};selected.push(body.model);
    if(body.model!=='openrouter/free')return new Response('',{status});
    return reply('print("hello")');
  };
  const client=new OpenRouterClient('',fetcher);
  try{
    const assistant=new Assistant({...defaults,model:'provider/example:free',stream:false},index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),'',()=>undefined);
    assert.equal((await assistant.run({task:'generate',prompt:'buat command',files:[]})).model,'openrouter/free');
    assert.deepEqual(selected,['provider/example:free','openrouter/free']);
    selected.length=0;status=401;
    await assert.rejects(()=>assistant.run({task:'generate',prompt:'buat command',files:[]}),/authentication/);
    assert.deepEqual(selected,['provider/example:free']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('explicit files and prompts redact credential before transmission',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-privacy-'));const key='sk-or-v1-testing-privatekey';let sent='';
  const client=new OpenRouterClient(key,async(_url,init)=>{sent=String(init?.body);return reply('print("safe")');});
  try{
    const assistant=new Assistant({...defaults,stream:false},index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),key,()=>undefined);
    await assistant.run({task:'explain',prompt:'Jelaskan '+key,files:[{name:'input.lua',path:'/not-sent/local/input.lua',content:'local token="'+key+'"'}]});
    assert.ok(!sent.includes(key));assert.ok(!sent.includes('/not-sent/local/'));assert.ok(sent.includes('[REDACTED]'));
  }finally{await rm(dir,{recursive:true,force:true});}
});

function partialStream():Response {
  return new Response('data: {"choices":[{"delta":{"content":"BROKEN_PARTIAL_RESPONSE"},"finish_reason":null}]}\n\n',{headers:{'content-type':'text/event-stream'}});
}
test('raw mode discards partial SSE and retries default free router once without streaming',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-raw-retry-'));
  const requests:Array<{model:string;stream:boolean;provider:unknown}>=[];
  const client=new OpenRouterClient('',async(_url,init)=>{
    requests.push(JSON.parse(String(init?.body)) as typeof requests[number]);
    return requests.length===1?partialStream():reply('print("complete")');
  });
  try{
    const assistant=new Assistant(defaults,index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),'',()=>undefined);
    const result=await assistant.run({task:'generate',prompt:'buat command',files:[]});
    assert.equal(result.code,'print("complete")');assert.ok(!result.text.includes('BROKEN_PARTIAL_RESPONSE'));
    assert.deepEqual(requests.map(r=>[r.model,r.stream]),[['openrouter/free',true],['openrouter/free',false]]);
    for(const r of requests)assert.deepEqual(r.provider,{max_price:{prompt:0,completion:0,request:0,image:0}});
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('raw mode also recovers partial selected free model; visible tokens never retry',async()=>{
  for(const visible of [false,true]){
    const dir=await mkdtemp(join(tmpdir(),'tern-emitted-'));const requests:string[]=[];const tokens:string[]=[];
    const client=new OpenRouterClient('',async(url,init)=>{
      if(String(url).endsWith('/models'))return Response.json({data:[{id:'p/free',pricing:{prompt:'0',completion:'0'}}]});
      const request=JSON.parse(String(init?.body)) as {model:string};requests.push(request.model);
      return requests.length===1?partialStream():reply('print("complete")');
    });
    try{
      const assistant=new Assistant({...defaults,model:'p/free'},index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),'',()=>undefined);
      const input={task:'generate' as const,prompt:'buat command',files:[],...(visible?{onToken:(t:string)=>tokens.push(t)}:{})};
      if(visible){await assert.rejects(()=>assistant.run(input),/before \[DONE\]/);assert.deepEqual(requests,['p/free']);assert.deepEqual(tokens,['BROKEN_PARTIAL_RESPONSE']);}
      else {assert.equal((await assistant.run(input)).code,'print("complete")');assert.deepEqual(requests,['p/free','openrouter/free']);}
    }finally{await rm(dir,{recursive:true,force:true});}
  }
});
test('recovery is bounded, skips paid/auth requests, respects long Retry-After and cancellation',async()=>{
  for(const scenario of ['repeated','paid','auth','credits','rate-limit','cancel'] as const){
    const dir=await mkdtemp(join(tmpdir(),'tern-recovery-limit-'));let calls=0;const controller=new AbortController();
    const client=new OpenRouterClient('',async(url)=>{
      if(String(url).endsWith('/models'))return Response.json({data:[{id:'p/paid',pricing:{prompt:'1',completion:'1'}}]});
      calls++;
      const status=scenario==='auth'?401:scenario==='credits'?402:scenario==='rate-limit'?429:502;
      return Response.json({error:{code:status,message:'specific failure'}},{status,headers:{'retry-after':scenario==='rate-limit'?'60':'0'}});
    });
    try{
      const assistant=new Assistant({...defaults,model:scenario==='paid'?'p/paid':'openrouter/free'},index,client,new ModelCatalog(new ConfigStore(dir),client,()=>undefined),'',message=>{if(scenario==='cancel' && message.includes('Retrying'))controller.abort();});
      await assert.rejects(()=>assistant.run({task:'generate',prompt:'buat command',files:[],signal:controller.signal}),scenario==='cancel'?/cancelled/:/specific failure/);
      assert.equal(calls,scenario==='repeated'?2:1,scenario);
    }finally{await rm(dir,{recursive:true,force:true});}
  }
});

test('simple chat uses compact context; code requests and attachments retain GTPS retrieval',async()=>{
  const requests:Array<{messages:Array<{role:string;content:string}>}>=[];
  const client=new OpenRouterClient('',async(_url,init)=>{
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({choices:[{message:{content:'Halo!'},finish_reason:'stop'}]});
  });
  const assistant=new Assistant({...defaults,stream:false},index,client,undefined,'',()=>{});
  const greeting=await assistant.run({task:'chat',prompt:'Hello cuy',files:[]});
  assert.equal(greeting.apiCount,0);
  assert.ok(JSON.stringify(requests[0]).length<1000);
  await assistant.run({task:'chat',prompt:'Buat daily quest dengan progress dialog',files:[]});
  assert.ok(JSON.stringify(requests[1]).includes('Authoritative GTPS API excerpts'));
  await assistant.run({task:'chat',prompt:'Hello',files:[{name:'script.lua',path:'script.lua',content:'print("hello")'}]});
  assert.ok(JSON.stringify(requests[2]).includes('Authoritative GTPS API excerpts'));
});

test('Daily Quest retrieves progress callbacks without irrelevant HTTP/logging docs from task wording',async()=>{
  let captured='';
  const client=new OpenRouterClient('',async(_url,init)=>{captured=String(init?.body);return reply('print("quest")');});
  const assistant=new Assistant({...defaults,stream:false},index,client,undefined,'',()=>{});
  await assistant.run({task:'generate',prompt:'Daily Quest: /dailyquest, break 100 blocks, harvest 50 provider, earn 10.000 gems, progress dialog UI, claim reward, save progress per player, reconnect, reset 24 jam.',files:[]});
  for(const name of ['onTileBreakCallback','onPlayerProviderCallback','onPlayerGemsObtainedCallback','onPlayerDialogCallback','player:onDialogRequest','saveDataToServer','loadDataFromServer'])assert.ok(captured.includes(name),name);
  assert.ok(!captured.includes('http.request('));
  assert.ok(!captured.includes('readLog('));
});

test('managed routing preserves a substantial complete Lua script throughout bounded repair',async()=>{
  const code='-- substantial script\n'+'-- retained context and modular logic\n'.repeat(420)+'onPlayerLeaveCallback(function(player) end)';
  const fixed=code.replace('onPlayerLeaveCallback','onPlayerDisconnectCallback');
  const contexts:Array<{messages:Array<{content:string}>}>=[];
  const client={managed:true,async complete(options:{messages:Array<{content:string}>}){
    contexts.push(options);return '```lua\n'+(contexts.length===1?code:fixed)+'\n```';
  }};
  const assistant=new Assistant(defaults,index,client,undefined,'',()=>{});
  const result=await assistant.run({task:'generate',prompt:'Daily Quest with progress dialog and player reconnect/disconnect',files:[]});
  assert.equal(contexts.length,2);
  assert.equal(result.code,fixed);assert.ok(result.validation?.syntaxValid);
  assert.ok(!result.validation?.findings.some(f=>f.severity==='error'));
  assert.ok(JSON.stringify(contexts[1]).includes(code.replaceAll('\n','\\n')));
  assert.ok(JSON.stringify(contexts[1]).includes('onPlayerDisconnectCallback'));
});
