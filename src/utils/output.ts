import luaparse from 'luaparse';
import { record } from './errors.js';
export interface ParsedOutput { code: string; explanation: string; warnings: string[] }
function parses(source: string): boolean {
  try { luaparse.parse(source,{luaVersion:'5.3'}); return source.trim().length>0; } catch { return false; }
}
export function extractOutput(text: string): ParsedOutput {
  const trimmed=text.trim();
  const jsonText=trimmed.replace(/^```json\s*\n/i,'').replace(/\n```$/,'');
  if (jsonText.startsWith('{')) {
    try {
      const value: unknown=JSON.parse(jsonText);
      if (record(value) && typeof value.code==='string') return {code:value.code.trim(),explanation:typeof value.explanation==='string'?value.explanation:'',warnings:Array.isArray(value.warnings)?value.warnings.filter((v):v is string=>typeof v==='string'):[]};
    } catch { /* Ordinary Lua tables and markdown are handled below, not JSON failures. */ }
  }
  const blocks=[...text.matchAll(/^[ \t]*(`{3,}|~{3,})[ \t]*([\w+-]*)[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm)];
  const lua=blocks.filter(b=>/^(lua|luau)?$/i.test(b[2] || ''));
  if (lua.length) return {code:lua.map(b=>b[3]?.trim()).join('\n\n'),explanation:text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm,'').trim(),warnings:lua.length>1?['Multiple Lua blocks were combined; verify they form one complete script.']:[]};
  if (parses(trimmed) || /^(?:--|local\s|function\s|registerLuaCommand\s*[{(]|on\w+\s*\()/m.test(trimmed) && !trimmed.includes('```')) return {code:trimmed,explanation:'',warnings:[]};
  // An unclosed code fence is never silently accepted as a complete script.
  return {code:'',explanation:trimmed,warnings:[]};
}
