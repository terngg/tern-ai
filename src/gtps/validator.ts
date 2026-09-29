import luaparse from 'luaparse';
import { record } from '../utils/errors.js';
import { ApiIndex, type ApiEntry } from './knowledge.js';

type Node = Record<string, unknown> & { type: string };
interface Binding { kind?: string; callable?: boolean; array?: string; custom?: boolean; reference?: string }
class Scope {
  private readonly symbols = new Map<string, Binding>();
  constructor(private readonly parent?: Scope) {}
  get(name: string): Binding | undefined { return this.symbols.get(name) || this.parent?.get(name); }
  set(name: string, value: Binding): void { this.symbols.set(name, value); }
}
export interface Finding { severity: 'error' | 'warning'; code: string; message: string; line: number }
export interface Validation { syntaxValid: boolean; recognized: string[]; findings: Finding[] }
const standardGlobals = new Set('assert error ipairs next pairs pcall print rawequal rawget rawlen rawset select setmetatable getmetatable tonumber tostring type xpcall unpack'.split(' '));
const libraries: Record<string, Set<string>> = {
  math: new Set('abs acos asin atan atan2 ceil cos cosh deg exp floor fmod frexp huge ldexp log log10 max min modf pow rad random randomseed sin sinh sqrt tan tanh tointeger type ult'.split(' ')),
  string: new Set('byte char dump find format gmatch gsub len lower match pack packsize rep reverse sub unpack upper'.split(' ')),
  table: new Set('concat insert move pack remove sort unpack'.split(' ')),
  os: new Set('clock date difftime time'.split(' ')),
  coroutine: new Set('create isyieldable resume running status wrap yield'.split(' ')),
  utf8: new Set('char codes codepoint len offset'.split(' ')),
};
const receivers = new Set('player world tile npc drop writer item invItem autofarm db storeItem mod topPlayer string'.split(' '));
const aliases: Record<string, string> = { Player: 'player', World: 'world', Item: 'item', InventoryItem: 'invItem', PlayerAutofarm: 'autofarm', BinaryWriter: 'writer' };
const arrayReturns: Record<string, string> = {
  getServerPlayers:'player', getAllPlayers:'player', getWorlds:'world', 'world:getPlayers':'player',
  'world:getTiles':'tile', 'world:getTilesByActionType':'tile', 'world:getCached':'tile',
  'world:getDroppedItems':'drop', 'world:findNPCByName':'npc', 'player:getInventoryItems':'invItem',
  'player:getBackpackItems':'invItem', 'player:getExtraBackpack':'invItem', getStoreItems:'storeItem', 'player:getMods':'mod',
};
function node(value: unknown): Node | undefined { return record(value) && typeof value.type === 'string' ? value as Node : undefined; }
function nodes(value: unknown): Node[] { return Array.isArray(value) ? value.flatMap(v => node(v) ? [v as Node] : []) : []; }
function id(value: unknown): string { const n = node(value); return n?.type === 'Identifier' && typeof n.name === 'string' ? n.name : ''; }
function member(value: Node): string { return id(value.identifier); }
function args(value: Node): Node[] {
  if (value.type === 'TableCallExpression') return nodes([value.arguments]);
  if (value.type === 'StringCallExpression') return nodes([value.argument]);
  return nodes(value.arguments);
}
function isCall(value: Node): boolean { return ['CallExpression', 'TableCallExpression', 'StringCallExpression'].includes(value.type); }
function line(value: Node): number { const loc = value.loc; return record(loc) && record(loc.start) && typeof loc.start.line === 'number' ? loc.start.line : 1; }
function arity(entry: ApiEntry): { min: number; max: number } | undefined {
  if (!entry.callable) return undefined;
  // These optional forms are explicitly described/examples in the supplied reference,
  // despite the abbreviated signature omitting square brackets.
  const documentedOptional: Record<string, {min:number;max:number}> = {
    setNPCScanFilter: {min:0,max:1}, 'http.get': {min:1,max:2},
    'http.post': {min:1,max:3}, setConvertLabel: {min:2,max:4},
  };
  if (documentedOptional[entry.name]) return documentedOptional[entry.name];
  if (!entry.signature.includes('(') || entry.signature.includes('(function(')) return { min: 1, max: 1 };
  const body = entry.signature.slice(entry.signature.indexOf('(') + 1, entry.signature.indexOf(')'));
  if (body.includes('{') || body.includes('function')) return undefined;
  if (!body) return { min: 0, max: 0 };
  const beforeOptional = body.split('[')[0] || '';
  const count = (s: string): number => s.replace(/[\[\]]/g, '').split(',').filter(x => x.trim() && x.trim() !== '...').length;
  return { min: count(beforeOptional), max: body.includes('...') ? Infinity : count(body) };
}
export function validateLua(code: string, index: ApiIndex): Validation {
  const findings: Finding[] = []; const recognized = new Set<string>();
  const profileCalls: Array<{node:Node;name:string}> = [];
  let root: Node;
  try { root = luaparse.parse(code, { luaVersion: '5.3', locations: true, scope: true }) as unknown as Node; }
  catch (error) { return { syntaxValid: false, recognized: [], findings: [{ severity:'error', code:'syntax', message: error instanceof Error ? error.message : 'Invalid Lua', line:1 }] }; }
  const add = (n: Node, code: string, message: string, severity: 'error' | 'warning' = 'error'): void => {
    if (!findings.some(f => f.code === code && f.message === message && f.line === line(n))) findings.push({severity,code,message,line:line(n)});
  };
  const callName = (n: Node, scope: Scope): string => {
    const base = node(n.base);
    if (!base) return '';
    if (base.type === 'Identifier') return scope.get(id(base))?.reference || id(base);
    if (base.type === 'MemberExpression') {
      const object = node(base.base); if (!object) return '';
      const name = id(object); const method = member(base);
      if (base.indexer === '.') return `${name}.${method}`;
      const kind = infer(object, scope).kind || (receivers.has(name) ? name : '?');
      // Scripted NPCs are normal player objects with two additional methods.
      if (kind === 'npc' && !index.byName.has(`npc:${method}`) && index.byName.has(`player:${method}`)) return `player:${method}`;
      return `${kind}:${method}`;
    }
    return '';
  };
  const infer = (n: Node, scope: Scope): Binding => {
    if (n.type === 'Identifier') return scope.get(id(n)) || (receivers.has(id(n)) ? {kind:id(n)} : {reference:id(n)});
    if (n.type === 'MemberExpression' && n.indexer === '.') {
      const base = node(n.base);
      if (base && id(base)) return {reference: `${id(base)}.${member(n)}`};
    }
    if (n.type === 'StringLiteral') return {kind:'string'};
    if (n.type === 'FunctionDeclaration') return {callable:true};
    if (n.type === 'TableConstructorExpression') return {custom:true};
    if (n.type === 'LogicalExpression') return infer(node(n.left) || n, scope);
    if (n.type === 'IndexExpression') { const base = node(n.base); const array = base && infer(base,scope).array; return array ? {kind:array} : {}; }
    if (isCall(n)) {
      const name = callName(n, scope);
      if (name === 'world:createNPC') return {kind:'npc'};
      if (name === 'BinaryWriter') return {kind:'writer'};
      if (name === 'sqlite.open') return {kind:'db'};
      if (arrayReturns[name]) return {array:arrayReturns[name]};
      const sig = index.byName.get(name)?.[0]?.signature || '';
      const returnType = /→\s*(\w+)/.exec(sig)?.[1] || '';
      const kind = aliases[returnType] || (receivers.has(returnType) ? returnType : undefined);
      return kind ? {kind} : {};
    }
    return {};
  };
  const callbackParams = (name: string): string[] => {
    if (name === 'command_callback') return ['player','string'];
    const e = index.byName.get(name)?.[0]; if (!e) return [];
    const list = /function\(([^)]*)\)/.exec(e.signature)?.[1] || /Arguments\s*:?\s*\(([^)]*)\)/i.exec(e.description)?.[1];
    if (list) return list.split(',').map(v => {
      const param=v.trim();
      if (/player|attacker|victim|targetPlayer|killedPlayer/.test(param)) return 'player';
      if (/^(world|tile|npc|drop)$/.test(param)) return param;
      if (/args|fullCommand/.test(param)) return 'string';
      return '';
    });
    return [];
  };
  const visit = (n: Node, scope: Scope, callback = '', hot = false, delayed = false): void => {
    if (n.type === 'Chunk') { for (const statement of nodes(n.body)) visit(statement, scope); return; }
    if (n.type === 'FunctionDeclaration') {
      const identifier = node(n.identifier);
      if (identifier?.type === 'Identifier') scope.set(id(identifier), {callable:true});
      else if (identifier?.type === 'MemberExpression') scope.set(`${id(identifier.base)}${String(identifier.indexer)}${member(identifier)}`, {callable:true});
      const inner = new Scope(scope); const types = callbackParams(callback);
      nodes(n.parameters).forEach((param, i) => {
        const kind = types[i] || (receivers.has(id(param)) ? id(param) : '');
        inner.set(id(param), kind ? {kind} : {});
      });
      for (const statement of nodes(n.body)) visit(statement,inner,'',hot,delayed);
      return;
    }
    if (n.type === 'LocalStatement' || n.type === 'AssignmentStatement') {
      const values = nodes(n.init); const variables=nodes(n.variables);
      values.forEach(value=>visit(value,scope,'',hot,delayed));
      variables.forEach((variable,i)=> {
        const value=values[i];
        if (id(variable)) scope.set(id(variable),value ? infer(value,scope) : {});
        else if (variable.type==='MemberExpression' && value?.type==='FunctionDeclaration') scope.set(`${id(variable.base)}${String(variable.indexer)}${member(variable)}`,{callable:true});
      });
      return;
    }
    if (n.type === 'ForGenericStatement') {
      const inner=new Scope(scope); const iter=nodes(n.iterators)[0];
      const iterable=iter && args(iter)[0]; const binding=iterable && infer(iterable,scope);
      const vars=nodes(n.variables); vars.forEach((v,i)=>inner.set(id(v),i===1 && binding?.array ? {kind:binding.array} : {}));
      nodes(n.iterators).forEach(v=>visit(v,scope,'',hot,delayed));
      nodes(n.body).forEach(v=>visit(v,inner,'',hot,delayed)); return;
    }
    if (['DoStatement', 'WhileStatement', 'RepeatStatement', 'ForNumericStatement', 'IfClause', 'ElseifClause', 'ElseClause'].includes(n.type)) {
      const inner = new Scope(scope);
      for (const [key, value] of Object.entries(n)) {
        if (['loc', 'range', 'comments'].includes(key)) continue;
        if (Array.isArray(value)) for (const child of nodes(value)) visit(child, inner, '', hot, delayed);
        else { const child = node(value); if (child) visit(child, inner, '', hot, delayed); }
      }
      return;
    }
    if (isCall(n)) {
      const name=callName(n,scope); const base=node(n.base); const params=args(n);
      const receiver=base?.type==='MemberExpression' ? node(base.base) : undefined;
      const method=base?.type==='MemberExpression' ? member(base) : '';
      const localBinding=base?.type==='Identifier' ? scope.get(id(base)) : undefined;
      const localCall=localBinding && !localBinding.reference;
      const customMember=base?.type==='MemberExpression' && scope.get(`${id(base.base)}${String(base.indexer)}${method}`)?.callable;
      const standard=standardGlobals.has(name) || (name.includes('.') && libraries[name.split('.')[0] || '']?.has(name.split('.')[1] || '')) || (base?.indexer===':' && libraries.string?.has(method) && (!receiver || !infer(receiver,scope).kind || infer(receiver,scope).kind==='string'));
      const entries=index.byName.get(name)?.filter(e=>e.callable);
      if (entries?.length) {
        recognized.add(name);
        if (entries.every(e=>e.status==='stub' || e.status==='not_dispatched')) add(n,'inactive',`${name} is ${entries[0]?.status}; it cannot implement an active feature.`);
        if (name==='enableCaching') add(n,'inactive','enableCaching is explicitly a no-op.');
        const ranges=entries.map(arity).filter((v): v is {min:number;max:number}=>!!v);
        if (ranges.length===entries.length && !params.some(p=>p.type==='VarargLiteral' || isCall(p)) && ranges.every(r=>params.length<r.min || params.length>r.max)) add(n,'arguments',`${name} argument count does not match ${entries.map(e=>e.signature).join(' / ')}.`);
        if (entries.every(e=>e.category==='Profile & Store')) profileCalls.push({node:n,name});
      } else if (!localCall && !customMember && !standard) {
        if (name.startsWith('?:') && receiver && infer(receiver,scope).custom) add(n,'unresolved',`Cannot verify custom-table call ${id(receiver)}:${method}.`,'warning');
        else if (name) add(n,'unknown',`Unknown GTPS API: ${name}`);
        else add(n,'dynamic','Dynamic function call cannot be statically verified.','warning');
      }
      if (hot && /getTiles|getAltAccounts|sqlite|http\.|saveData|loadData/.test(name)) add(n,'performance',`${name} inside a hot callback may be expensive.`,'warning');
      if (name==='world:setPlayerPosition') add(n,'coordinates','setPlayerPosition units conflict in the source. Use movePlayer with pixels.');
      if (name==='world:movePlayer' || name==='world:createNPC' || name==='world:playVisualEffect') {
        for (const p of params) if (isCall(p) && /^(tile:getPos[XY]|player:getBlockPos[XY])$/.test(callName(p,scope))) add(n,'coordinates',`${name} needs pixels; convert tile coordinates by multiplying by 32.`);
      }
      if (name==='world:punchTile' && params[0] && infer(params[0],scope).kind==='player') add(n,'argument-order','world:punchTile expects (tile, player).');
      if (name==='world:plantFromMagplant' && params[0] && infer(params[0],scope).kind==='tile') add(n,'argument-order','world:plantFromMagplant expects (player, tile).');
      if (receiver && isCall(receiver) && /or nil/.test(index.byName.get(callName(receiver,scope))?.[0]?.signature || '')) add(n,'nil','Dereferencing an API result that may be nil; store it and guard it.','warning');
      if (delayed && receiver && infer(receiver,scope).kind==='player') add(n,'lifetime',`Check delayed player ${id(receiver) || 'handle'} is re-resolved with getPlayer(userID) and nil/isOnline-guarded.`,'warning');
      const nextHot=hot || /^(onTick|onPlayerTick|onWorldTick|onTilePunchCallback|onPlayerSendRaw)$/.test(name);
      const nextDelayed=delayed || name.startsWith('timer.') || name==='http.request';
      if (base?.type==='MemberExpression' && receiver && isCall(receiver)) visit(receiver,scope,'',hot,delayed);
      for (const p of params) {
        if (p.type==='FunctionDeclaration') visit(p,scope,name,nextHot,nextDelayed);
        else if (p.type==='TableConstructorExpression') {
          for (const field of nodes(p.fields)) {
            const value=node(field.value); if (!value) continue;
            const key=id(field.key);
            visit(value,scope,name==='registerLuaCommand' && key==='callback' ? 'command_callback' : '',nextHot,nextDelayed);
          }
        } else visit(p,scope,'',hot,delayed);
      }
      return;
    }
    for (const [key,value] of Object.entries(n)) {
      if (['loc','range','comments','globals'].includes(key)) continue;
      if (Array.isArray(value)) for (const child of nodes(value)) visit(child,scope,'',hot,delayed);
      else { const child=node(value); if (child) visit(child,scope,'',hot,delayed); }
    }
  };
  visit(root,new Scope());
  if (!recognized.has('onPlayerProfileRequest') && !recognized.has('onStoreRequest')) {
    for (const call of profileCalls) add(call.node,'profile-gate',`${call.name} requires registration of onPlayerProfileRequest or onStoreRequest.`);
  }
  if (/registerLuaCommand/.test(code) && /roleRequired\s*=\s*(?:[1-9]|Roles\.)/.test(code) && !/hasRole\s*\(|exactRole\s*=\s*true/.test(code)) findings.push({severity:'warning',code:'role',message:'roleRequired alone is not an authorization gate. Add hasRole or exactRole.',line:1});
  return {syntaxValid:true,recognized:[...recognized].sort(),findings};
}
