// Test-only network interception. This module is excluded from the published package.
import { appendFile } from 'node:fs/promises';
let requests = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/models')) return Response.json({data:[{id:'openrouter/free',name:'Free',pricing:{prompt:'0',completion:'0'}}]});
  if (String(url).endsWith('/key')) return Response.json({data:{label:'test'}});
  const body = JSON.parse(String(init?.body));
  if (process.env.TERN_TEST_CAPTURE) await appendFile(process.env.TERN_TEST_CAPTURE,JSON.stringify(body)+'\n');
  requests++;
  if(process.env.TERN_TEST_STREAM_BREAK && requests===1)return new Response('data: {"choices":[{"delta":{"content":"BROKEN_PARTIAL_RESPONSE"}}]}\n\n',{headers:{'content-type':'text/event-stream'}});
  const script = process.env.TERN_TEST_INVALID ? 'player:addWorldLock(5)' : `registerLuaCommand{command="balance",roleRequired=0,callback=function(player,args)\n  player:onConsoleMessage(tostring(player:getGems()) .. " gems")\nend}\n-- revision ${requests}`;
  const text='```lua\n'+script+'\n```';
  if(!body.stream)return Response.json({choices:[{message:{content:text},finish_reason:'stop'}]});
  const encoder=new TextEncoder();
  return new Response(new ReadableStream({start(controller){
    for(const chunk of text.match(/.{1,11}|\n/g) || [])controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:chunk},finish_reason:null}]})+'\n\n'));
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();
  }}),{headers:{'content-type':'text/event-stream'}});
};
