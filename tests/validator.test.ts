import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKnowledge } from '../src/gtps/knowledge.js';
import { validateLua } from '../src/gtps/validator.js';
const index=await loadKnowledge();
const codes=(lua:string):string[]=>validateLua(lua,index).findings.map(f=>f.code);
test('Lua syntax validation separate from API validation',()=>{
  assert.equal(validateLua('if true then print(1)',index).syntaxValid,false);
  const result=validateLua('player:onConsoleMessage("hi")',index);
  assert.equal(result.syntaxValid,true);assert.deepEqual(result.findings,[]);assert.deepEqual(result.recognized,['player:onConsoleMessage']);
});
test('unknown APIs, globals, table/string call forms, and ignored comments/strings',()=>{
  assert.ok(codes('player:addWorldLock(5)').includes('unknown'));
  assert.ok(codes('sendConsole("hi")').includes('unknown'));
  assert.ok(codes('invented {amount=5}').includes('unknown'));
  assert.ok(codes('invented "hi"').includes('unknown'));
  assert.deepEqual(codes('-- player:fake()\nlocal text="sendConsole()"\nprint(text)'),[]);
  assert.deepEqual(codes('local function helper(x) return tostring(x) end\nprint(helper(1))'),[]);
  assert.ok(codes('json.save("data")').includes('unknown'));
  assert.ok(codes('local send=sendConsole\nsend("hi")').includes('unknown'));
  assert.ok(codes('do local function sendConsole() end end\nsendConsole("hi")').includes('unknown'));
  assert.deepEqual(codes('local get=getPlayer\nlocal p=get(1)\nif p then p:onConsoleMessage("hi") end'),[]);
});
test('handle inference across aliases, callback parameters and loop arrays',()=>{
  assert.ok(codes('local p=getPlayer(1)\nif p then p:addWorldLock(5) end').includes('unknown'));
  assert.ok(codes('onPlayerLoginCallback(function(p) p:madeUp() end)').includes('unknown'));
  assert.deepEqual(codes('for _, p in ipairs(getServerPlayers()) do p:onConsoleMessage("hi") end'),[]);
  assert.deepEqual(codes('local w=BinaryWriter("")\nw:WriteUInt8(48)\nprint(w:GetCurrentString())'),[]);
  assert.deepEqual(codes('local af=player:getAutofarm()\nif af then af:setTargetBlockID(242) end'),[]);
});
test('stub, non-dispatched and gated APIs',()=>{
  assert.ok(codes('onPlayerCrimeCallback(function(w,p,id,n) end)').includes('inactive'));
  assert.ok(codes('player:getDiscordID()').includes('inactive'));
  assert.ok(codes('getStoreItems()').includes('profile-gate'));
  assert.ok(!codes('onStoreRequest(function(w,p) return false end)\ngetStoreItems()').includes('profile-gate'));
  assert.ok(codes('-- onStoreRequest(function() end)\ngetStoreItems()').includes('profile-gate'));
});
test('argument order/count, units and callback risks',()=>{
  assert.ok(codes('player:giveItem(242)').includes('arguments'));
  assert.ok(codes('world:punchTile(player,tile)').includes('argument-order'));
  assert.ok(codes('world:movePlayer(player,tile:getPosX(),tile:getPosY())').includes('coordinates'));
  assert.ok(!codes('world:movePlayer(player,tile:getPosX()*32,tile:getPosY()*32)').includes('coordinates'));
  assert.ok(codes('onWorldTick(function(w) w:getTiles() end)').includes('performance'));
  assert.ok(codes('getWorld("ABC"):getName()').includes('nil'));
  assert.ok(codes('timer.setTimeout(1,function() player:onConsoleMessage("hi") end)').includes('lifetime'));
  assert.deepEqual(codes('setNPCScanFilter()\nhttp.get("https://example.com")\nhttp.post("https://example.com")\nsetConvertLabel(7188,nil)'),[]);
});
test('real daily command uses only recognized APIs',()=>{
  const result=validateLua(`registerLuaCommand{
    command="daily", roleRequired=0, callback=function(player,args)
      local key="daily_" .. player:getUserID()
      local d=loadDataFromServer(key) or {}
      local now=os.time()
      if now-(tonumber(d.last) or 0)<86400 then player:onConsoleMessage("Tunggu");return end
      if not saveDataToServer(key,{last=now}) then return end
      if not player:giveItem(242,5) then player:onConsoleMessage("Gagal; hubungi admin") end
    end
  }`,index);
  assert.deepEqual(result.findings,[]);assert.ok(result.recognized.length>=5);
});
