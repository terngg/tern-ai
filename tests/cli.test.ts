import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { validateLua } from '../src/gtps/validator.js';
import { loadKnowledge } from '../src/gtps/knowledge.js';
async function run(args:string[],directory:string,input='',mock=true,extra:Record<string,string>={}):Promise<{code:number|null;out:string;err:string}>{
  return new Promise((resolveResult,reject)=>{
    const child=spawn(process.execPath,[...(mock?['--import',resolve('tests/mock-openrouter.mjs')]:[]),'--import','tsx','src/index.ts',...args],{
      env:{...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(GEMINI|OPENROUTER)_API_KEY(?:_[1-9][0-9]*)?$/.test(k))),TERN_CONFIG_DIR:directory,OPENROUTER_API_KEY:mock?'sk-or-v1-test-only-1234':'',...extra},stdio:'pipe',
    });
    let out='';let err='';child.stdout.on('data',c=>{out+=String(c);});child.stderr.on('data',c=>{err+=String(c);});
    const timeout=setTimeout(()=>{child.kill();reject(new Error('CLI timed out'));},15_000);
    child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);resolveResult({code,out,err});});child.stdin.end(input);
  });
}
test('CLI help, first-run, auth status, configuration, models and offline doctor',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-cli-'));
  try{
    const help=await run(['--help'],dir,'',false);assert.equal(help.code,0);assert.match(help.out,/generate/);
    const first=await run([],dir,'',false);assert.equal(first.code,1);assert.match(first.err,/Welcome to Tern AI/);
    const auth=await run(['auth','status'],dir);assert.match(auth.out,/\*\*\*\*1234/);assert.ok(!auth.out.includes('test-only'));
    assert.equal((await run(['model','set','p/m:free'],dir)).code,0);assert.match((await run(['model'],dir)).out,/p\/m:free/);
    assert.equal((await run(['model','reset'],dir)).code,0);
    assert.equal((await run(['config','set','temperature','9'],dir)).code,1);
    const models=await run(['models','--free'],dir);assert.equal(models.code,0);assert.match(models.out,/openrouter\/free/);
    assert.equal((await run(['doctor','--offline'],dir)).code,0);
    assert.equal((await run(['auth'],dir,'',false)).code,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('raw stdout is only validated Lua; output refuses overwrite; failed repair emits no Lua',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-raw-'));const file=join(dir,'output.lua');
  try{
    const raw=await run(['generate','buat balance','--raw'],dir);assert.equal(raw.code,0);assert.equal(raw.err,'');
    assert.ok(!raw.out.includes('```'));assert.equal(validateLua(raw.out,await loadKnowledge()).syntaxValid,true);
    assert.equal((await run(['generate','buat balance','-o',file],dir)).code,0);
    assert.equal((await run(['generate','buat balance','-o',file],dir)).code,1);
    assert.equal((await run(['generate','buat balance','-o',file,'--force'],dir)).code,0);
    const broken=await run(['generate','buat balance','--raw'],dir,'',true,{TERN_TEST_INVALID:'1'});
    assert.equal(broken.code,2);assert.equal(broken.out,'');assert.match(broken.err,/Validation failed/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('fix shows diff without mutation, --write applies, and interactive follow-up retains context',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-chat-'));const file=join(dir,'bank.lua');const capture=join(dir,'requests.jsonl');
  try{
    await writeFile(file,'print("original")\n');
    const fixed=await run(['fix',file],dir);assert.equal(fixed.code,0);assert.match(fixed.out,/@@/);assert.equal(await readFile(file,'utf8'),'print("original")\n');
    assert.equal((await run(['fix',file,'--write'],dir)).code,0);assert.match(await readFile(file,'utf8'),/registerLuaCommand/);
    const session=await run(['chat',file],dir,'buat balance\ntambah cooldown\n/context\n/exit\n',true,{TERN_TEST_CAPTURE:capture});
    assert.equal(session.code,0);assert.match(session.out,/Conversation: 4 messages/);
    const requests=(await readFile(capture,'utf8')).trim().split('\n').map(s=>JSON.parse(s) as {messages:Array<{role:string;content:string}>});
    assert.equal(requests.length,2);assert.ok(requests[1]?.messages.some(m=>m.role==='assistant' && m.content.includes('revision 1')));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('raw CLI recovers a disconnected multiline request without leaking the partial response',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-cli-retry-'));const capture=join(dir,'requests.jsonl');
  const prompt='buatkan saya script /bansos sama\n/setbansos khusus role 1000. Dialog setting banyak item dan count, simpan permanen,\nlalu /bansos bagikan ke semua player online tanpa mengubah setting.';
  try{
    const result=await run(['generate',prompt,'--raw'],dir,'',true,{TERN_TEST_STREAM_BREAK:'1',TERN_TEST_CAPTURE:capture});
    assert.equal(result.code,0,result.err);assert.equal(result.err,'');assert.ok(!result.out.includes('BROKEN_PARTIAL_RESPONSE'));
    const validation=validateLua(result.out,await loadKnowledge());assert.equal(validation.syntaxValid,true);assert.ok(!validation.findings.some(f=>f.severity==='error'));
    const requests=(await readFile(capture,'utf8')).trim().split('\n').map(s=>JSON.parse(s) as {stream:boolean;model:string;messages:Array<{content:string}>});
    assert.deepEqual(requests.map(r=>r.stream),[true,false]);assert.ok(requests.every(r=>r.model==='openrouter/free'));
    assert.ok(requests[0]?.messages.some(m=>m.content.includes(prompt)));
    for(const request of requests) {
      assert.ok(request.messages.some(m=>m.content.includes('add_text_input|<name>|<label>|<initialText>|<maxLength>|')));
      assert.ok(request.messages.some(m=>m.content.includes('set_bg_color|43,34,74,200|')));
      assert.ok(request.messages.some(m=>m.content.includes('onPlayerDialogCallback(function(world, player, data) end)')));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
