import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CredentialStore } from '../src/config/credentials.js';
import { ConfigStore } from '../src/config/store.js';
import { program } from '../src/cli/program.js';
const envKeys={GEMINI_API_KEY_1:'AIza-invalid-mock-key-1111',GEMINI_API_KEY_2:'AIza-valid-mock-key-2222',GEMINI_API_KEY_3:'AIza-valid-mock-key-3333',OPENROUTER_API_KEY_1:'sk-or-valid-mock-key-1111',OPENROUTER_API_KEY_2:'sk-or-valid-mock-key-2222'};
async function run(directory:string,args:string[],env:Record<string,string>={},input=''):Promise<{code:number|null;out:string;err:string}> {
  return new Promise((resolveResult,reject)=>{
    const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(GEMINI|OPENROUTER)_API_KEY(?:_[1-9][0-9]*)?$/.test(k)));
    const child=spawn(process.execPath,['--import',resolve('tests/mock-providers.mjs'),'--import','tsx','src/index.ts',...args],{env:{...clean,TERN_CONFIG_DIR:directory,...env},stdio:'pipe'});
    let out='';let err='';child.stdout.on('data',d=>{out+=String(d);});child.stderr.on('data',d=>{err+=String(d);});
    const timer=setTimeout(()=>{child.kill();reject(new Error('CLI test timed out'));},20_000);
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolveResult({code,out,err});});child.stdin.end(input);
  });
}
test('version originates in package metadata',async()=>{const p=JSON.parse(await readFile('package.json','utf8')) as {version:string};assert.equal(program().version(),p.version);});
test('real SDK mocked HTTP: single/multiple keys, legacy env, auth/429 rotation and provider fallback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-multi-cli-'));
  try {
    const scenarios:Array<[Record<string,string>,string]>=[
      [{GEMINI_API_KEY:envKeys.GEMINI_API_KEY_2},'gemini'],
      [{GEMINI_API_KEY_1:envKeys.GEMINI_API_KEY_2,GEMINI_API_KEY_2:envKeys.GEMINI_API_KEY_3,GEMINI_API_KEY_3:'AIza-fourth-key-4444'},'gemini'],
      [{OPENROUTER_API_KEY:envKeys.OPENROUTER_API_KEY_1},'openrouter'],
      [{OPENROUTER_API_KEY_1:'sk-or-invalid-key-1111',OPENROUTER_API_KEY_2:envKeys.OPENROUTER_API_KEY_2},'openrouter'],
      [envKeys,'gemini'],
      [{...envKeys,GEMINI_API_KEY_1:'AIza-limited-key-1111'},'gemini'],
      [{...envKeys,TERN_TEST_GEMINI_DOWN:'1'},'openrouter'],
      [{...envKeys,TERN_TEST_PARTIAL:'1',GEMINI_API_KEY_1:envKeys.GEMINI_API_KEY_3},'gemini'],
    ];
    for(const [env,provider] of scenarios){const result=await run(dir,['generate','buat command /test','--raw'],env);assert.equal(result.code,0,result.err);assert.equal(result.err,'');assert.equal(result.out,`print("${provider}")\n`);}
    const empty=await run(dir,['generate','test','--raw']);assert.equal(empty.code,1);assert.equal(empty.out,'');assert.match(empty.err,/No AI provider/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('doctor remains usable with either provider, forced mode, and missing credentials',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-doctor-cli-'));
  try {
    for(const extra of [{},{TERN_TEST_GEMINI_DOWN:'1'},{TERN_TEST_ROUTER_DOWN:'1'}]){
      const result=await run(dir,['doctor'],{...envKeys,...extra});assert.equal(result.code,0,result.out+result.err);assert.match(result.out,/Tern is ready/);
    }
    assert.equal((await run(dir,['doctor'],{...envKeys,TERN_TEST_GEMINI_DOWN:'1',TERN_TEST_ROUTER_DOWN:'1'})).code,1);
    const none=await run(dir,['doctor']);assert.equal(none.code,1);assert.match(none.out,/No AI provider credentials configured/);
    await run(dir,['provider','set','gemini']);assert.equal((await run(dir,['doctor'],{...envKeys,TERN_TEST_GEMINI_DOWN:'1'})).code,1);
    await run(dir,['provider','auto']);assert.equal((await run(dir,['status','--live'],envKeys)).code,0);
    await run(dir,['model','set','gemini','missing-model']);const missing=await run(dir,['generate','test','--raw'],envKeys);assert.equal(missing.out,'print("openrouter")\n');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('credentials/model/status/verbose output never reveals keys; removal is targeted',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-safe-cli-'));
  try {
    const store=new CredentialStore(new ConfigStore(dir));await store.add('gemini',envKeys.GEMINI_API_KEY_2,{});await store.add('gemini',envKeys.GEMINI_API_KEY_3,{});await store.add('openrouter',envKeys.OPENROUTER_API_KEY_1,{});
    for(const args of [['auth','list'],['status'],['doctor'],['auth','test'],['auth','test','gemini'],['auth','test','gemini-1'],['generate','test','--verbose']]){
      const result=await run(dir,args,envKeys);
      for(const key of Object.values(envKeys))assert.ok(!(result.out+result.err).includes(key),args.join(' '));
      if(args.includes('--verbose')){assert.equal(result.code,0,result.err);assert.match(result.err,/Credential:/);}
    }
    assert.equal((await run(dir,['auth','remove','gemini-1'])).code,1);
    assert.equal((await run(dir,['auth','remove','gemini-1','--yes'])).code,0);
    assert.deepEqual((await store.load({})).map(c=>c.id),['gemini-2','openrouter-1']);
    assert.equal((await run(dir,['models','gemini'],envKeys)).code,0);
    const models=await run(dir,['models','gemini'],envKeys);assert.match(models.out,/gemini-3.8-flash/);
    await run(dir,['model','set','gemini','gemini-future']);assert.equal((await new ConfigStore(dir).load()).providers.gemini.model,'gemini-future');
    const logout=await run(dir,['auth','logout']);assert.equal(logout.code,0);assert.deepEqual((await store.load({})).map(c=>c.id),['gemini-2']);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('raw Gemini CLI recovers broken streams; verbose diagnostics stay on stderr',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-gemini-recovery-'));
  const prompt='buatkan saya script /bansos sama\n/setbansos khusus role 1000, dialog multi item dan count, simpan permanen';
  const env={GEMINI_API_KEY:envKeys.GEMINI_API_KEY_2,TERN_TEST_GEMINI_STREAM_BREAK:'1'};
  try {
    for(const verbose of [false,true]){
      const result=await run(dir,['generate',prompt,'--raw',...(verbose?['--verbose']:[])],env);
      assert.equal(result.code,0,result.err);assert.equal(result.out,'print("gemini")\n');
      if(verbose){assert.match(result.err,/Provider: gemini/);assert.match(result.err,/once without streaming/);}
      else assert.equal(result.err,'');
      assert.ok(!(result.out+result.err).includes(env.GEMINI_API_KEY));
      assert.ok(!(result.out+result.err).includes('BROKEN_PARTIAL_RESPONSE'));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('chat /model lists Gemini, selects by number or bare ID, and applies immediately without losing history',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-chat-models-'));
  try {
    const store=new ConfigStore(dir);await store.set('providerMode','gemini');
    const env={GEMINI_API_KEY:envKeys.GEMINI_API_KEY_2,TERN_TEST_EXPECT_GEMINI_MODEL:'gemini-mock-second,gemini-3.8-flash'};
    const result=await run(dir,['chat'],env,'/model\n/model 2\nbuat bank\n/model gemini-3.8-flash\ntambah transfer\n/context\n/exit\n');
    assert.equal(result.code,0,result.err);assert.match(result.out,/Gemini models/);assert.match(result.out,/2\. gemini-mock-second/);
    assert.match(result.err,/gemini model: gemini-mock-second/);assert.match(result.err,/gemini model: gemini-3.8-flash/);
    assert.match(result.out,/Conversation: 4 messages/);assert.ok(!result.err.includes('✗'),result.err);
    const saved=await store.load();assert.equal(saved.providers.gemini.model,'gemini-3.8-flash');assert.equal(saved.providers.openrouter.model,'openrouter/free');assert.equal(saved.providerMode,'gemini');
    const invalid=await run(dir,['chat'],env,'/model 2\n/model\n/model 99\n/model gemini too many args\n/exit\n');
    assert.match(invalid.err,/Invalid model number/);assert.match(invalid.err,/Usage: \/model/);assert.deepEqual(await store.load(),saved);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('chat model provider forms preserve legacy OpenRouter IDs and persist across sessions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-chat-model-compat-'));
  try {
    const store=new ConfigStore(dir);await store.set('providerMode','gemini');
    const env={GEMINI_API_KEY:envKeys.GEMINI_API_KEY_2};
    const result=await run(dir,['chat'],env,'/models gemini\n/model gemini gemini-mock-second\n/model openrouter explicit/free:free\n/model legacy/model:free\n/model models/gemini-3.8-flash\n/model gemini-mock-second\n/exit\n');
    assert.ok(!result.err.includes('✗'),result.err);assert.match(result.out,/Gemini models/);
    const config=await store.load();assert.equal(config.providers.gemini.model,'gemini-mock-second');assert.equal(config.model,'legacy/model:free');assert.equal(config.providerMode,'gemini');
    const next=await run(dir,['chat'],env,'/model\n/exit\n');assert.match(next.out,/Current: gemini-mock-second/);assert.match(next.out,/gemini-mock-second \(current\)/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('chat /models follows configured provider priority and supports explicit OpenRouter listing',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-chat-list-models-'));
  try {
    const gemini=await run(dir,['chat'],envKeys,'/models\n/models openrouter\n/exit\n');assert.match(gemini.out,/Gemini models/);assert.match(gemini.out,/OpenRouter models \(free\)/);
    const router=await run(dir,['chat'],{OPENROUTER_API_KEY:envKeys.OPENROUTER_API_KEY_1},'/models\n/model 1\n/exit\n');assert.match(router.out,/OpenRouter models/);assert.match(router.err,/openrouter model: openrouter\/free/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
