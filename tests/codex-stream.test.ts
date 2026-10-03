import test from 'node:test';
import assert from 'node:assert/strict';
import { codexText, parseCodexModels } from '../src/companion/adapters/codex-stream.js';
import { LocalProviderError } from '../src/companion/adapters/local-error.js';
async function* chunks(events: unknown[]) {
  const source=events.map(e=>JSON.stringify(e)).join('\n');
  for(let i=0;i<source.length;i+=7)yield source.slice(i,i+7);
}
async function collect(source:AsyncIterable<string>){let out='';for await(const text of source)out+=text;return out;}
test('Codex catalog uses only visible discovered IDs and public metadata',()=>{
  const models=parseCodexModels(JSON.stringify({identity:'private',models:[
    {slug:'gpt-6-astra',display_name:'GPT-6 Astra',visibility:'list',context_window:100000,default_reasoning_level:'low',base_instructions:'private'},
    {slug:'internal',visibility:'hide'}, {slug:'invalid key secret',visibility:'list'}]}));
  assert.deepEqual(models,[{id:'gpt-6-astra',name:'GPT-6 Astra',contextWindow:100000,defaultReasoningEffort:'low'}]);
  assert.deepEqual(parseCodexModels('not JSON'),[]);
  assert.deepEqual(parseCodexModels('{}'),[]);
  assert.ok(!JSON.stringify(models).includes('private'));
});
test('Codex forwards final answer and reported usage only after a successful turn',async()=>{
  let usage;
  const answer=await collect(codexText(chunks([
    {type:'item.completed',item:{type:'reasoning',text:'private reasoning'}},
    {type:'item.completed',item:{type:'command_execution',text:'secret diagnostics'}},
    {type:'item.completed',item:{type:'agent_message',phase:'commentary',text:'internal notes'}},
    {type:'item.completed',item:{type:'agent_message',phase:'final_answer',text:'hello world'}},
    {type:'turn.completed',usage:{input_tokens:34,output_tokens:12,cached_input_tokens:20}},
  ]),value=>{usage=value;}));
  assert.equal(answer,'hello world');assert.deepEqual(usage,{inputTokens:34,outputTokens:12});
});
test('Codex rejects failed, malformed and incomplete turns without exposing diagnostics',async()=>{
  for(const type of ['turn.failed','error'])await assert.rejects(collect(codexText(chunks([
    {type,error:{message:'429 quota secret-token'},message:'429 secret-token'}
  ]))),e=>e instanceof LocalProviderError && e.category==='rate_limit' && !e.message.includes('secret-token'));
  await assert.rejects(collect(codexText(chunks([{type:'item.completed',item:{type:'agent_message',text:'partial'}}]))));
  await assert.rejects(collect(codexText(chunks([{type:'turn.completed'}]))));
  await assert.rejects(collect(codexText((async function*(){yield 'secret-token';})())),e=>e instanceof Error&&!e.message.includes('secret-token'));
});
