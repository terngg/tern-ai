import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEntry, loadKnowledge, parseDocs } from '../src/gtps/knowledge.js';
import { buildContext } from '../src/prompts/context.js';
import { SYSTEM_PROMPT } from '../src/prompts/system.js';
const index=await loadKnowledge();
test('all 485 source entries and all categories are preserved',()=>{
  assert.equal(index.entries.length,485);assert.equal(index.byName.size,483);
  assert.equal(index.byName.get('player:getSubscription')?.length,2);
  assert.equal(index.byName.get('onPlayerCrimeCallback')?.[0]?.status,'not_dispatched');
  assert.equal(index.byName.get('player:getDiscordID')?.[0]?.status,'stub');
  assert.equal(index.byName.get('player:getPosX')?.[0]?.status,'extension');
  assert.match(index.byName.get('registerLuaCommand')?.[0]?.description || '',/NOT permission/);
  assert.match(index.byName.get('timer.setInterval')?.[0]?.example || '',/300/);
  assert.equal(new Set(index.entries.map(e=>e.category)).size,12);
  assert.throws(()=>parseDocs('## Player\n### player:madeUp()\nbad\nNo status'));
});
test('Indonesian retrieval selects daily, bank, timing, stubs; stays bounded',()=>{
  const daily=index.retrieve('buat command /daily kasih 5 WL tiap 24 jam');
  for(const name of ['registerLuaCommand','player:giveItem','player:getUserID','saveDataToServer','loadDataFromServer'])assert.ok(daily.some(e=>e.name===name),name);
  const bank=index.retrieve('buat sistem bank gems deposit withdraw balance');
  assert.ok(bank.some(e=>e.name==='player:depositGems'));assert.ok(bank.some(e=>e.name==='player:withdrawGems'));
  assert.ok(index.retrieve('onPlayerCrimeCallback').some(e=>e.status==='not_dispatched'));
  assert.ok(index.retrieve('auto announcement setiap 5 menit').some(e=>e.name==='timer.setInterval'));
  assert.ok(daily.length<50);
});
test('context preserves rules and latest full turns, never slices code',()=>{
  const history=Array.from({length:10},(_,i)=>({role:i%2?'assistant' as const:'user' as const,content:`turn${i} `+'x'.repeat(1000)}));
  const context=buildContext(index,'buat /daily',[],history,'auto','',12_000);
  assert.equal(context.messages[0]?.content,SYSTEM_PROMPT);
  assert.ok(context.omitted>0);assert.equal(context.omitted%2,0);
  for(const m of context.messages.slice(2,-1))assert.ok(history.some(h=>h.content===m.content));
  assert.throws(()=>buildContext(index,'x'.repeat(9000),[],[],'auto'),/Prompt exceeds/);
});
test('dialog generation receives C++ markup and callback contracts together',()=>{
  for(const request of ['buat dialog setting banyak item dan count','buat menu bank gems','buat formulir dengan tombol simpan','edit add_checkbox di popup','player:onDialogRequest("...")']) {
    const context=buildContext(index,request,[],[],'auto');
    const reference=context.messages[1]?.content || '';
    assert.ok(context.entries.slice(0,2).some(e=>e.name==='player:onDialogRequest'),request);
    assert.ok(context.entries.slice(0,2).some(e=>e.name==='onPlayerDialogCallback'),request);
    for(const syntax of ['add_label|big|<text>|left|0|','add_text_input|<name>|<label>|<initialText>|<maxLength>|','add_button|<id>|<label>|noflags|0|0|','end_dialog|<dialog_name>|<cancelLabel>|<okLabel>|','set_bg_color|43,34,74,200|','data.buttonClicked']) assert.ok(reference.includes(syntax),syntax);
    assert.match(reference,/DialogBuilder\.cpp/);
  }
});
test('dialog reference survives follow-up, attached Lua and repair contexts within budget',()=>{
  const code='player:onDialogRequest("add_button|save|Save|noflags|0|0|\\nend_dialog|settings|||\\n")';
  const contexts=[
    buildContext(index,'ubah judulnya',[],[{role:'user',content:'buat pengaturan'},{role:'assistant',content:code}],'auto','',16_000),
    buildContext(index,'perbaiki ini',[{name:'menu.lua',path:'/tmp/menu.lua',content:code}],[],'auto','',16_000),
    buildContext(index,'buat pengaturan',[],[],'auto','Repair previous response:\n'+code,16_000),
  ];
  for(const context of contexts) {
    assert.ok(context.entries.some(e=>e.name==='onPlayerDialogCallback'));
    assert.ok(context.messages[1]?.content.includes('add_checkbox|<name>|<label>|<0-or-1>|'));
    assert.ok(context.messages.reduce((sum,m)=>sum+Buffer.byteLength(m.content)+64,0)<=16_000);
  }
  assert.throws(()=>index.retrieve('buat dialog',1000),/preserve dialog syntax/);
  const entries=index.retrieve('buat dialog',6000);
  assert.ok(entries.some(e=>e.name==='player:onDialogRequest'));
  assert.ok(entries.reduce((sum,e)=>sum+Buffer.byteLength(formatEntry(e)),0)<=6000);
});
