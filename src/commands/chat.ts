import { ChatModels } from './chat-models.js';
import { createInterface } from 'node:readline';
import { assistant, runtime } from './runtime.js';
import { info, output, status, TokenWriter, warn } from '../cli/io.js';
import { readContexts, saveLua } from '../utils/files.js';
import type { Message } from '../openrouter/client.js';
import { checkResult } from './tasks.js';
import { messageOf, TernError } from '../utils/errors.js';
export async function chat(paths:string[]):Promise<void> {
  const rt=await runtime();const models=new ChatModels(rt);let files=await readContexts(paths);let history:Message[]=[];let lastCode='';
  output(`Tern AI · GTPS Lua Assistant\nProvider: ${rt.config.providerMode}\nGemini: ${rt.client.pool.snapshot().filter(c=>c.provider==='gemini').length} keys\nOpenRouter: ${rt.client.pool.snapshot().filter(c=>c.provider==='openrouter').length} keys\nType /help for commands.\n`);
  const rl=createInterface({input:process.stdin,output:process.stdout,terminal:!!process.stdin.isTTY && !!process.stdout.isTTY,historySize:0});
  let active:AbortController | undefined;let interrupted=false;
  const cancel=():void=>{if(active){active.abort();}else{interrupted=true;rl.close();}};
  rl.on('SIGINT',cancel);process.on('SIGINT',cancel);
  const prompt=():void=>{if(process.stdin.isTTY){rl.setPrompt('> ');rl.prompt();}};
  prompt();
  try {
    for await(const input of rl) {
      const text=input.trim();if(!text){prompt();continue;}
      try {
        if(text.startsWith('/')) {
          const split=text.indexOf(' ');const command=split<0?text:text.slice(0,split);const arg=split<0?'':text.slice(split+1).trim();
          if(command==='/exit') break;
          if(command==='/help') output('/help · /clear (conversation) · /reset (conversation and files)\n/model [number | model-id | provider model-id] · /models [gemini | openrouter] · /context · /save <file.lua> · /exit');
          else if(command==='/clear' || command==='/reset') {history=[];lastCode='';if(command==='/reset')files=[];info('✓ Context cleared.');}
          else if(command==='/context') output(`Files: ${files.map(f=>f.name).join(', ') || 'none'}\nConversation: ${history.length} messages\nLatest validated script: ${lastCode?Buffer.byteLength(lastCode)+' bytes':'none'}\nOlder complete turns are removed when context budget is reached.`);
          else if(command==='/model' || command==='/models') {
            active=new AbortController();
            try {
              if(command==='/model')await models.model(arg,active.signal);
              else await models.list(arg || undefined,active.signal);
            }finally{active=undefined;}
          }
          else if(command==='/save') {
            if(!arg || !lastCode)throw new TernError('Usage: /save <file.lua> after a validated code response.');
            await saveLua(arg.replace(/^"|"$/g,''),lastCode);info(`✓ Script written to ${arg}`);
          }
          else warn('Unknown session command. Type /help.');
        } else {
          active=new AbortController();const writer=new TokenWriter(rt.key);
          try {
            const result=await assistant(rt,message=>{writer.end();status(message);}).run({task:'chat',prompt:text,files,history,signal:active.signal,onToken:t=>writer.write(t)});
            writer.end();
            if(result.code) {
              lastCode=checkResult(result);
              info(`✓ ${result.validation?.recognized.length || 0} recognized GTPS APIs; runtime review still required.`);
            }
            history.push({role:'user',content:text},{role:'assistant',content:result.text});
            // Bound resident session history as well as transmitted context.
            while(history.length>20 || history.reduce((n,m)=>n+Buffer.byteLength(m.content),0)>96_000) history.splice(0,2);
          } finally {writer.end();active=undefined;}
        }
      } catch(error) {info('✗ '+messageOf(error));}
      if(interrupted)break;prompt();
    }
  } finally {rl.close();process.off('SIGINT',cancel);}
}
