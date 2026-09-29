import { readFile } from 'node:fs/promises';
import { TernError } from '../utils/errors.js';
export type ApiStatus = 'live' | 'extension' | 'stub' | 'not_dispatched';
export interface ApiEntry {
  name: string; category: string; status: ApiStatus; signature: string;
  description: string; example: string; notes: string; categoryNotes: string; callable: boolean;
}
export function parseDocs(markdown: string): ApiEntry[] {
  const entries: ApiEntry[] = [];
  let category = ''; let categoryNotes = ''; let signature = ''; let body: string[] = [];
  const finish = (): void => {
    if (!signature) return;
    const status = body.shift()?.trim();
    if (!['live', 'extension', 'stub', 'not_dispatched'].includes(status || '')) throw new TernError(`Missing API status: ${signature}`);
    const text = body.join('\n').trim();
    const name = /^([\w]+(?::[\w]+|\.[\w]+)?)/.exec(signature)?.[1];
    if (!name) throw new TernError(`Invalid API signature: ${signature}`);
    entries.push({ name, category, status: status as ApiStatus, signature,
      description: text.replace(/```lua\n[\s\S]*?```/g, '').trim(),
      example: [...text.matchAll(/```lua\n([\s\S]*?)```/g)].map(m => m[1]).join('\n'),
      notes: / notes$/.test(signature) ? text : '', categoryNotes: categoryNotes.trim(),
      callable: !/ notes$/.test(signature) && signature.includes('(') || signature.includes('{'),
    });
    signature = ''; body = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) { finish(); category = line.slice(3); categoryNotes = ''; }
    else if (line.startsWith('### ')) { finish(); signature = line.slice(4); }
    else if (signature) body.push(line);
    else if (category) categoryNotes += line + '\n';
  }
  finish();
  if (!entries.length) throw new TernError('GTPS documentation has no API entries.');
  return entries;
}
const concepts: Array<[RegExp, string]> = [
  [/daily|harian|cooldown|reward|hadiah|\bwl\b|world lock/i, 'registerLuaCommand player:giveItem player:getItemAmount player:getUserID player:onConsoleMessage loadDataFromServer saveDataToServer cooldown reward'],
  [/bank|deposit|withdraw|saldo|balance|gems/i, 'registerLuaCommand getGems getGemsBank depositGems withdrawGems onConsoleMessage'],
  [/role|staff|moderator|izin|permission|giveitem/i, 'hasRole getServerRoles registerLuaCommand giveItem'],
  [/log|drop|jatuh/i, 'onPlayerDropCallback sendLog readLog'],
  [/leaderboard|peringkat|terkaya/i, 'getServerPlayers getGems getCleanName loadDataFromServer saveDataToServer'],
  [/npc/i, 'createNPC getWorld npc:move npcSay findNPCByName'],
  [/teleport|pindah|posisi|coordinate|koordinat/i, 'enterWorld movePlayer getPosX getBlockPosX getWorld'],
  [/sidebar/i, 'addSidebarButton json.encode onPlayerActionCallback'],
  [/dialog|menu|formulir|\bform\b|popup|pop-up|button|tombol|checkbox|text_input|item_picker/i, 'onPlayerDialogCallback player:onDialogRequest'],
  [/quest|misi/i, 'addDailyQuest getDailyQuests getDailyQuest'],
  [/announce|pengumuman|menit|timer|async|interval/i, 'timer.setInterval timer.setTimeout timer.clearInterval getServerPlayers getUserID getPlayer isOnline'],
  [/spam/i, 'onPlayerCommandCallback getUserID onPlayerDisconnectCallback onConsoleMessage'],
  [/playmod|mod custom/i, 'registerLuaPlaymod addMod hasMod removeMod'],
  [/effect|efek/i, 'world:setEffects world:playEffect player:setEffects'],
  [/http|request|webhook/i, 'http.request http.get http.post getUserID getPlayer isOnline'],
  [/crime|card.?battle|discord/i, 'onPlayerCrimeCallback onPlayerCardBattleCallback getDiscordID'],
];
function words(value: string): string[] {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\d_]+/gu) || [];
}
export class ApiIndex {
  readonly byName = new Map<string, ApiEntry[]>();
  private readonly terms = new Map<ApiEntry, Set<string>>();
  private readonly frequency = new Map<string, number>();
  constructor(readonly entries: ApiEntry[]) {
    for (const entry of entries) {
      this.byName.set(entry.name, [...this.byName.get(entry.name) || [], entry]);
      const terms = new Set(words(`${entry.name} ${entry.category} ${entry.description}`));
      this.terms.set(entry, terms);
      for (const word of terms) this.frequency.set(word, (this.frequency.get(word) || 0) + 1);
    }
  }
  retrieve(query: string, maxBytes = 12_000): ApiEntry[] {
    let expanded = query;
    for (const [pattern, extra] of concepts) if (pattern.test(query)) expanded += ' ' + extra;
    const terms = new Set(words(expanded));
    // Keep the source-derived markup and return handler ahead of optional APIs.
    // Also covers existing Lua, conversation history and automatic repair input.
    const needsDialog = expanded.includes('onDialogRequest') || expanded.includes('onPlayerDialogCallback');
    const dialogNames = new Set(['player:onDialogRequest', 'onPlayerDialogCallback']);
    const ranked = this.entries.map(entry => {
      let score = 0;
      const nameTerms = new Set(words(entry.name));
      for (const word of terms) if (this.terms.get(entry)?.has(word)) score += (nameTerms.has(word) ? 5 : 1) * Math.log(1 + this.entries.length / (this.frequency.get(word) || 1));
      if (query.includes(entry.name)) score += 80;
      else if (expanded.includes(entry.name)) score += 25;
      // Match methods on aliases (p:giveItem) without assuming an undocumented function exists.
      const method = entry.name.split(':')[1];
      if (method && query.includes(':' + method)) score += 60;
      return { entry, score, required: needsDialog && dialogNames.has(entry.name) };
    }).filter(x => x.score > 0 || x.required).sort((a, b) => Number(b.required) - Number(a.required) || b.score - a.score);
    const selected: ApiEntry[] = []; let size = 0;
    const requiredBytes = ranked.filter(x => x.required).reduce((sum, x) => sum + Buffer.byteLength(formatEntry(x.entry)), 0);
    if (requiredBytes > maxBytes) throw new TernError('Context is too large to preserve dialog syntax and callback rules. Reduce the supplied files or prompt.');
    for (const { entry } of ranked) {
      const bytes = Buffer.byteLength(formatEntry(entry));
      if (size + bytes > maxBytes) continue;
      selected.push(entry); size += bytes;
      if (selected.length >= 40) break;
    }
    return selected;
  }
}
export function formatEntry(e: ApiEntry): string {
  return `[${e.category}; ${e.status}] ${e.signature}\n${e.categoryNotes}\n${e.description}${e.example ? '\nExample (may use local helpers):\n' + e.example : ''}\n`;
}
export async function loadKnowledge(): Promise<ApiIndex> {
  // Works in both src/gtps and dist/gtps, including an npm global install.
  const path = new URL('../../docs/gtps-lua-api.md', import.meta.url);
  try { return new ApiIndex(parseDocs(await readFile(path, 'utf8'))); }
  catch (error) { throw new TernError(`Cannot load bundled GTPS documentation: ${error instanceof Error ? error.message : 'read failed'}`); }
}
