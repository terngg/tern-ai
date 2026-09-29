import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigStore, defaults, configDir, validateConfig } from '../src/config/store.js';
import { maskKey, redact, terminalText } from '../src/utils/security.js';
test('config defaults, validated updates, persistence and corruption',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-test-'));const store=new ConfigStore(dir);
  try {
    assert.deepEqual(await store.load(),defaults);
    await store.set('model','provider/model:free');await store.set('temperature',0.6);
    assert.equal((await new ConfigStore(dir).load()).model,'provider/model:free');
    assert.equal((await store.load()).temperature,0.6);
    for(const [key,value] of [['temperature',3],['stream','true'],['maxRepairAttempts',3],['model','invalid'],['apiKey','secret']])await assert.rejects(()=>store.set(String(key),value));
    await writeFile(join(dir,'config.json'),'{bad');await assert.rejects(()=>store.load(),/Invalid config/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('environment credential wins, stored key isolated and private',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tern-auth-'));const store=new ConfigStore(dir);
  const key='sk-or-v1-test-only-7f92';
  try{
    await store.saveCredential(key);
    assert.equal((await store.credential({}))?.key,key);
    assert.equal((await store.credential({OPENROUTER_API_KEY:'env-test'}))?.key,'env-test');
    await store.set('language','Bahasa Indonesia');
    assert.ok(!(await readFile(join(dir,'config.json'),'utf8')).includes(key));
    if(process.platform!=='win32'){assert.equal((await stat(join(dir,'credentials.json'))).mode&0o777,0o600);assert.equal((await stat(dir)).mode&0o777,0o700);}
    await store.logout();assert.equal(await store.credential({}),undefined);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('masking, redaction and terminal sanitization',()=>{
  assert.equal(maskKey('sk-or-v1-example7f92'),'sk-or-v1-****7f92');
  assert.equal(maskKey('tiny'),'****');
  assert.ok(!redact('secret exact-value','exact-value').includes('exact-value'));
  assert.ok(!redact('Authorization: Bearer abc').includes('abc'));
  assert.equal(terminalText('\x1b[31mred\x1b[0m\x1b]52;c;c2VjcmV0\x07'),'red');
});
test('cross platform config paths and strict primitive validation',()=>{
  assert.equal(configDir({XDG_CONFIG_HOME:'/tmp/config'},'linux'),join('/tmp/config','tern-ai'));
  assert.equal(configDir({APPDATA:'/tmp/roaming'},'win32'),join('/tmp/roaming','tern-ai'));
  assert.equal(configDir({TERN_CONFIG_DIR:'/tmp/override'},'linux'),'/tmp/override');
  assert.throws(()=>validateConfig({...defaults,temperature:NaN}));
  assert.throws(()=>validateConfig({...defaults,maxRepairAttempts:1.5}));
  assert.throws(()=>validateConfig({...defaults,constructor:'unexpected'}));
});
