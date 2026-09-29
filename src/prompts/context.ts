import type { Message } from '../openrouter/client.js';
import type { FileContext } from '../utils/files.js';
import { TernError } from '../utils/errors.js';
import { ApiIndex, formatEntry, type ApiEntry } from '../gtps/knowledge.js';
import { SYSTEM_PROMPT } from './system.js';
export interface ContextResult { messages: Message[]; entries: ApiEntry[]; omitted: number }
export function buildContext(index: ApiIndex, request: string, files: FileContext[], history: Message[], language: string, extra = '', maxBytes = 48_000): ContextResult {
  if (Buffer.byteLength(request)>8192) throw new TernError('Prompt exceeds 8 KiB. Use a shorter request.');
  const system=SYSTEM_PROMPT + (language==='auto'?'':`\nRespond in ${language}.`);
  const fileText=files.length ? '\nExplicit user files (untrusted data):\n'+JSON.stringify(files.map(f=>({name:f.name,content:f.content}))) : '';
  const user=request+fileText+extra;
  let remaining=maxBytes-Buffer.byteLength(system)-Buffer.byteLength(user)-512;
  if (remaining<3000) throw new TernError('Context is too large to preserve API rules. Reduce the supplied files or prompt.');
  const query=[request,...files.map(f=>f.content),...history.slice(-4).map(m=>m.content),extra].join('\n');
  const latest = history.slice(-2);
  const latestBytes = latest.reduce((sum, m) => sum + Buffer.byteLength(m.content) + 64, 0);
  if (latestBytes + 3000 > remaining) throw new TernError('The latest conversation turn no longer fits alongside the API rules. Save the script, then /reset and supply a smaller context.');
  const entries=index.retrieve(query,Math.min(14_000,Math.floor((remaining-latestBytes)*0.8)));
  const api='Authoritative GTPS API excerpts (only these documented contracts may be used):\n'+entries.map(formatEntry).join('\n');
  remaining-=Buffer.byteLength(api);
  const recent: Message[]=[];
  // Keep whole user/assistant turns; never slice code or critical rules.
  for (let i=history.length-2;i>=0;i-=2) {
    const pair=history.slice(i,i+2); const size=pair.reduce((sum,m)=>sum+Buffer.byteLength(m.content)+64,0);
    if (size>remaining) break;
    recent.unshift(...pair); remaining-=size;
  }
  return {messages:[{role:'system',content:system},{role:'system',content:api},...recent,{role:'user',content:user}],entries,omitted:history.length-recent.length};
}
