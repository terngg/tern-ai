import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,writeFile,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractOutput } from '../src/utils/output.js';
import { readContexts,saveLua } from '../src/utils/files.js';
test('markdown, plain Lua, structured output, refusals and incomplete fences',()=>{
  assert.equal(extractOutput('Berikut script:\n```lua\nprint(1)\n```\nCatatan.').code,'print(1)');
  assert.equal(extractOutput('print("hi")').code,'print("hi")');
  assert.equal(extractOutput('{"code":"print(1)","explanation":"ok","warnings":["test"]}').warnings[0],'test');
  assert.equal(extractOutput('API tersebut belum aktif.').code,'');
  assert.equal(extractOutput('```lua\nprint(1)').code,'');
  assert.equal(extractOutput('```\nlocal x = 1\n```').code,'local x = 1');
});
test('explicit files only, limits, no overwrite, write race and symlink protection',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-files-'));const file=join(dir,'bank.lua');
  try{
    await saveLua(file,'print(1)');assert.equal((await readContexts([file]))[0]?.content,'print(1)\n');
    await assert.rejects(()=>saveLua(file,'print(2)'),/already exists/);
    await saveLua(file,'print(2)',true,'print(1)\n');assert.equal(await readFile(file,'utf8'),'print(2)\n');
    await assert.rejects(()=>saveLua(file,'print(3)',true,'old'),/changed/);
    await assert.rejects(()=>readContexts([join(dir,'.env')]),/Only .lua/);
    const large=join(dir,'big.lua');await writeFile(large,'x'.repeat(17000));await assert.rejects(()=>readContexts([large]),/at most/);
    if(process.platform!=='win32'){const link=join(dir,'link.lua');await symlink(file,link);await assert.rejects(()=>saveLua(link,'print(3)',true),/symlink/);}
  }finally{await rm(dir,{recursive:true,force:true});}
});
