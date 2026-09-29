# GTPS Hosting Lua API

Source: the engine documentation supplied by the project owner, imported 2026-09-28.
This is the sole engine reference. Navigation chrome was removed; entries are normalized
as signature headings, status, description, parameter notes, and examples. The page
advertises 485 entries (including one notes entry and a subscription overload).
Do not import definitions from other engines. Examples can contain script-local helpers:
`sendConsole`, `log`, `stash`, `skip`, `showWelcome`, `saveMyState` are NOT engine APIs.

Statuses: live = bound and dispatched; extension = available here but not upstream;
stub = accepted but ineffective; not_dispatched = registered callback never invoked.
See engine-notes.md for conflicts in the supplied examples. All argument orders and
units below are engine-specific. Standard Lua functions are separate from engine APIs.

## Callbacks
All optional; may be registered more than once. Run in registration order. An error in one is logged and swallowed, never fatal.

### onPlayerPickupItemCallback(function(world, player, itemID, count, drop) end) → boolean
live
Before a dropped pile is picked up. Return true to leave it on the ground.

### onPlayerVendingBuyCallback(function(world, player, tile, itemID, itemCount) end) → boolean
live
Before a vending purchase is paid for. Return true to block the sale.

### onPlayerRecycleCallback(function(world, player, itemID, amount, gemsEarned) end) → boolean
live
Before items are recycled. Return true to refuse and keep items.

### onPlayerPlaymodAddedCallback(function(player, id, duration, givenBy) end)
live
When a playmod is added, whatever added it. givenBy is always nil.

### onPlayerPlaymodRemovedCallback(function(player, id) end)
live
When a playmod is removed.

### onPlayerFishingStatusCallback(function(world, player, tile, status, baitID) end)
live
Fishing status: 0 started, 1 fish on the line, 2 missed, 3 caught.

### onNPCTileCallback(function(world, npc, tile) end) → boolean
live
Per tile near an NPC. Return true to claim it.
```lua
setNPCScanFilter{2}
onNPCTileCallback(function(world, npc, tile)
    npc:move(tile:getPosX(), tile:getPosY())
    return true
end)
```

### onNPCBreakCallback(function(world, npc, tile) end) → boolean
live
For a tile onNPCTileCallback claimed.
```lua
onNPCBreakCallback(function(world, npc, tile)
    npc:breakTile(tile)
    return true
end)
```

### onHarvestDropCallback(function(world, player, tile, itemID, count) end) → boolean
live
Before a harvest drops. Return true to cancel the drop and keep the item.
Source example calls `stash(player, itemID, count)` before returning true; stash is a user-defined helper, not an engine function.

### onPlayerPearlsChangeCallback(function(player, before, after) end)
live
When Pearls balance changes. Advisory only.
```lua
onPlayerPearlsChangeCallback(function(player, before, after)
    player:onConsoleMessage("Pearls: " .. after)
end)
```

### onTilePlacedCallback(function(world, player, tile) end)
live
After a player places a tile.
```lua
onTilePlacedCallback(function(world, player, tile)
    if tile:getTileForeground() == 25002 then world:updateTile(tile) end
end)
```

### onPlayerLoginCallback(function(player) end)
live
After a successful login.
```lua
onPlayerLoginCallback(function(player)
    player:onConsoleMessage("`2Welcome back, " .. player:getCleanName() .. "!")
end)
```

### onPlayerDisconnectCallback(function(player) end)
live
When a peer disconnects. Free per-player state; getUserID is still readable here.
```lua
local session = {}
onPlayerEnterWorldCallback(function(world, player)
    session[player:getUserID()] = { world = player:getWorldName() }
end)
onPlayerDisconnectCallback(function(player)
    session[player:getUserID()] = nil
end)
```

### onPlayerEnterWorldCallback(function(world, player) end)
live
When a player finishes entering a world.
```lua
onPlayerEnterWorldCallback(function(world, player)
    player:onConsoleMessage("You entered `w" .. world:getName())
end)
```

### onPlayerSendRaw(function(player, packet) end) → boolean
live
Before ANY variant packet is sent to a client. Wider than onPlayerVariantCallback. packet is a 1-based array; packet[1] is its name (OnConsoleMessage, OnDialogRequest, OnFtueButtonDataSet). Strings/numbers/floats stay themselves; vectors become "x,y" or "x,y,z". Return true to block, anything else allows. Block original and sendVariant to change a packet.
```lua
onPlayerSendRaw(function(player, packet)
    local name = packet[1]
    if name == "OnDialogRequest" then
        sendLog(player:getName() .. " <- dialog, " .. #packet .. " args")
    end
    if name == "OnFtueButtonDataSet" and #packet < 5 then return true end
    return false
end)
```

### onPlayerSendRaw notes
live
Only variant packets named OnSomething, not binary movement/tile stream. No cost until registered; thereafter every outgoing variant runs Lua, so keep short. Handler's own packets bypass the hook, so onConsoleMessage will not recurse. Errors are logged and the packet is allowed. Match packet[1] narrowly; blocking the wrong variant can strand a client.

### onPlayerCommandCallback(function(world, player, fullCommand) end) → boolean
live
When a player types a command. Lua first, before built-ins. fullCommand has NO leading slash: "setdelay 1500". true = handled, built-in skipped; false = next callback then built-ins.
```lua
onPlayerCommandCallback(function(world, player, fullCommand)
    local cmd, args = fullCommand:match("^(%S+)%s*(.*)")
    if cmd == "mycmd" then
        if not player:hasRole(998) then return false end
        player:onConsoleMessage("args: " .. args)
        return true
    end
    return false
end)
```

### onPlayerDialogCallback(function(world, player, data) end) → boolean
live
On dialog interaction. data includes dialog_name, buttonClicked and other returned fields.
Match data.dialog_name to the name in end_dialog, and data.buttonClicked to an explicit add_button ID. Read named inputs as data.field_name (or data["field_name"]). Checkbox values use "1"/"0"; compare tostring(data.field_name) to "1", not Lua truthiness. Treat returned inputs and embed_data as untrusted; recheck permissions and validate quantities before changing state. Return false for unrelated dialogs. Prefer an explicit action button with an empty end_dialog OK label so the action has a known buttonClicked ID; do not assume the footer label is a button ID.
```lua
onPlayerDialogCallback(function(world, player, data)
    if data.dialog_name == "my_menu" and data.buttonClicked == "ok" then
        player:onConsoleMessage("You picked: " .. tostring(data.choice))
        return true
    end
    return false
end)
```

### onTileBreakCallback(function(world, player, tile) end) → boolean
live
Just before the block clears, so snapshot still reads what was there. Return is IGNORED. Restore with timer.setTimeout(0, fn), re-resolving tile/world.
```lua
onTileBreakCallback(function(world, player, tile)
    if tile:getTileID() == 14 then
        world:spawnItem(tile:getPosX(), tile:getPosY(), 242, 1)
        return true -- advisory only; does not cancel
    end
    return false
end)
```

### onPlayerConsumableCallback(function(world, player, tile, itemID, targetPlayer) end) → boolean
live
When a consumable is used. true claims the item and skips engine handling.
```lua
onPlayerConsumableCallback(function(world, player, tile, itemID, targetPlayer)
    if itemID == 20222 then return true end
    return false
end)
```

### onPlayerActionCallback(function(world, player, data) end) → boolean
live
Every action packet from logged-in player. data.action/text etc. Sidebar click has data.action = buttonAction. true skips built-in handling, false allows; every registered callback still runs.
```lua
onPlayerActionCallback(function(world, player, data)
    if data.action == "open_profit" then
        world:sendPlayerMessage(player, "/sell")
        return true
    end
    return false
end)
```

### onPlayerVariantCallback(function(player, variant, delay, netID) end) → boolean
live
Before certain variants: OnEventButtonDataSet (event/sidebar), OnDialogRequest (screen text). true suppresses.
```lua
onPlayerVariantCallback(function(player, variant, delay, netID)
    if variant[1] == "OnDialogRequest" then return false end
end)
```

### onTilePunchCallback(function(world, player, tile) end)
live
Every swing, including misses. Advisory, hotter than break callbacks; keep cheap.

### onTilePunchClaimCallback(function(world, player, tile) end) → boolean
live
Same swing, after advisory hook. true cancels.
```lua
onTilePunchClaimCallback(function(world, player, tile)
    if tile:getTileID() == 1008 then return true end
end)
```

### onPlayerConvertItemCallback(function(world, player, itemID) end) → boolean
live
When Convert is pressed. true means script pays out itself.
```lua
onPlayerConvertItemCallback(function(world, player, itemID)
    if itemID ~= 7188 then return false end
    -- script must take items and give its own reward
    return true
end)
```

### onGetTileExtraDataCallback(function(world, tile, gameVersion, player) end) → string
live
When a tile updates. Return string to replace extra data or false to leave it. gameVersion is a string.
```lua
onGetTileExtraDataCallback(function(world, tile, gameVersion, player)
    if tile:getTileForeground() ~= 25002 then return false end
    local w = BinaryWriter("")
    w:WriteUInt8(48)
    return w:GetCurrentString()
end)
```

### onTileWrenchCallback(function(world, player, tile) end)
live
After tile resolved, before block dialog. Advisory; wrench menu opens regardless.

### onPlayerXPCallback(function(world, player, amount) end)
live
After every XP multiplier; amount is actual XP. Event XP follows another path and is not reported.

### onPlayerCatchFishCallback(function(world, player, rewardID, rewardAmount) end)
live
When a fish lands, with caught item and weight.

### onPlayerGeigerCallback(function(world, player, itemID, amount) end)
live
When geiger hunt yields an item: world, finder, found item id and count.

### onPlayerCatchGhostCallback(function(world, player, jarID, amount) end)
live
When a ghost is caught, after jar is in inventory. jarID depends on ghost, not always same jar.
```lua
local caught = {}
onPlayerCatchGhostCallback(function(world, player, jarID, amount)
    local n = player:getName()
    caught[n] = (caught[n] or 0) + amount
    player:onConsoleMessage("`2Ghosts caught: " .. caught[n])
end)
```

### onPlayerGhostModeCallback(function(world, player, reason) end) → boolean or nil
live
Decides /ghost: true allows, false refuses, nil uses policy. reason "command" or "enter".
```lua
onPlayerGhostModeCallback(function(world, player, reason)
    if world:getName() == "START" then return false end
end)
```

### onGhostSpawnCallback(function(world, x, y, ghostType, reason) end) → boolean
live
Before automatic ghost spawn. false cancels. x/y tiles, ghostType 1 normal, reason abandoned/event.
```lua
onGhostSpawnCallback(function(world, x, y, ghostType, reason)
    if world:getName() == "START" then return false end
end)
```

### onPlayerTrainFishCallback(function(world, player) end)
live
When fish put in tank. Advisory; already in tank.

### onPlayerCookingCallback(function(world, player, resultID, resultAmount, accuracy) end)
live
When oven punched and dish resolves, success or ruin. resultID is recipe dish even on ruin. resultAmount is actual payout (0 or ruinedResult count on ruin). accuracy 0-100; compare recipe minAccuracy, not just amount, for success.
```lua
onPlayerCookingCallback(function(world, player, resultID, resultAmount, accuracy)
    if accuracy >= 90 then player:onConsoleMessage("`2Perfectly cooked!") end
end)
```

### onPlayerPlantCallback(function(world, player, tile) end)
live
Seed/tree planting, not magplant. Advisory; planting happens regardless.

### onPlayerHarvestCallback(function(world, player, tile, amount) end)
live
Once per harvested tree. amount fruit dropped. Advisory; return unused.

### onProviderDropCallback(function(world, player, tile, itemID, count) end) → boolean
live
Per provider item before magplant bonus/ground drop. true cancels drop so script takes it itself.

### onPlayerGemsObtainedCallback(function(world, player, amount) end)
live
Awarded gems; amount after all multipliers.

### onPlayerSurgeryCallback(function(world, player, resultID, resultAmount, targetPlayer) end)
live
Once per completed surgery on surgeon. Prize id/count; targetPlayer is still nil.

### onPlayerProviderCallback(function(world, player, tile, itemID, itemAmount) end)
live
Each provider cycle payout. player is owner. Advisory; payout happens regardless.

### onPlayerRegisterCallback(function(world, player) end)
live
Once when account first created, not every login.

### onPlayerPunchPlayerCallback(function(world, attacker, victim) end)
live
Derived PVP hit on another player's tile. No native PVP event. Track HP in script; use world:kill(victim) on zero.

### onPlayerKillCallback(function(world, player, killedPlayer) end)
live
From world:kill(), only PVP-style kill path. killedPlayer passed as BOTH player arguments; no distinct killer known.

### onTick(function() end)
live
About once per second. Cheap unused. Handler exceeding 1000ms aborted, not stacked.
```lua
local n = 0
onTick(function()
    n = n + 1
    if n % 60 == 0 then print("a minute passed") end
end)
```

### onAutoSaveRequest(function() end)
live
Every 60 seconds as a save-your-data prompt. Periodic tick, not notification that a save is happening.

### onPlayerTick(function(player) end)
live
About once per second for EACH online player. Keep work light.

### onPlayerPutOutFireCallback(function(world, player, tile) end)
live
After fire already out. Advisory.
```lua
onPlayerPutOutFireCallback(function(world, player, tile)
    player:addGems(50)
    player:onConsoleMessage("`2Thanks for putting that out!")
end)
```

### onBlacklistAccessCallback(function(player) end) → boolean [, string]
live
Gates No-/Buy items across buy/spawn/drop, once per action. Unregistered uses built-in policy. Any true allows among handlers; false denies silently; false,message denies with max 512 byte message.
```lua
onBlacklistAccessCallback(function(player)
    if player:hasRole(998) then return true end
    return false, "`4Only staff can buy this."
end)
```

### onLootCallback(function(world, player, tile, amount) end)
live
When player granted gems as loot, with source tile.

### onPlayerMovedCallback(function(world, player, x, y) end)
live
When player's TILE position changes, polled, not every pixel movement.

### onPlayerStateChangedCallback(function(world, player, state) end)
live
State walking/lava/water/air. Source example calls player:updateHealth(-10), which is NOT separately documented; do not assume available.

### onPlayerProfileRequest(function(world, player, tabID, flags) end) → boolean
live
When own profile opens. true replaces it. tabID always 1 (info), flags always 0; embed flags in dialog to read back.

### onStoreRequest(function(world, player) end) → boolean
live
When store opens. true replaces built-in store.

## Globals
Callable anywhere with no prefix unless qualified explicitly.

### getServerRoles() → table
live
Every built-in/custom role: id,name,custom. Source mentions server:getroleserver() alias, without standalone signature.
```lua
for _, r in ipairs(getServerRoles()) do print(r.id, r.name, r.custom) end
```

### Roles.ROLE_NAME → number
live
Role level by name, built-in/custom. Unknown name raises. Roles.VIP also works. Query getServerRoles for exact configured roles.
```lua
registerLuaCommand({ command = "panel", roleRequired = Roles.ROLE_DEVELOPER })
if player:hasRole(Roles.ROLE_VIP) then end
```

### BinaryWriter([bytes]) → BinaryWriter
live
Little-endian builder, capped 1 MB.

### getDailyQuest() → table
live
Today's Crazy Jim quest: item1,count1,item2,count2,reward.

### setDailyQuest{ item1 = , count1 = , item2 = , count2 = } → boolean
live
Replaces today's Crazy Jim quest. Re-rolled next daily reset.

### addDailyQuest{ name = , items = , reward = , onComplete = } → number
live
Adds below Crazy Jim's own. Up to 32 quests, each once per day.
```lua
addDailyQuest{
    name = "Bring Dirt", items = {{2, 50}}, reward = {1486, 1},
    onComplete = function(player, index) player:onConsoleMessage("Thanks!") end,
}
```

### getDailyQuests() → table
live
Quests added with addDailyQuest.

### getClashEvent() → table
live
Clash state: active,item,itemName,secondsLeft,secondsUntilNext.

### startClashEvent() → boolean
live
Starts Clash on next rotation item.

### stopClashEvent() → boolean
live
Ends Clash and settles leaderboards.

### setClashEventItem(itemID) → boolean
live
Changes running Clash item without re-announcing.

### getClashLeaderboard(which [, limit]) → table
live
Highest first. which = personal or guild.

### addClashPoints(player, points) → boolean
live
Ignored when no active event.

### setClashPoints(eventItemID, { [toolID] = points }) → number
live
Tool points for Clash item. nil clears.

### setReconnectWorldEnabled(enabled) → boolean
live
Return dropped player to prior world. Default on.

### setNPCScanFilter(ids) → number
live
Item ids scan reports. Empty scans everything. setNPCScanFilter{2,10}; setNPCScanFilter().

### setNPCScanInterval(ms) → number
live
100-5000 milliseconds, default 250.

### getNewsBanner() → string
live
News texture path.

### getNewsBannerDimensions() → string
live
Config banner size, empty until configured.

### getTodaysDate() → string
live
Date such as August 21st.

### getTodaysEvents() → string
live
Event names from config; empty until configured.

### getCurrentEventDescription() → string
live
Event text from config; empty until configured.

### getCurrentDailyEventDescription() → string
live
Daily event text from config; empty until configured.

### getCurrentRoleDayDescription() → string
live
Role day text from config; empty until configured.

### getTopWorldByVisitors() → world or nil
live
World of the Day or nil when none set.

### resetColor(text) → string
live
Appends colour reset so later text not tinted.

### enableCaching(itemID) → boolean
live
Compatibility no-op. Always true, DOES NOTHING here despite live label.

### print(...)
live
Server log prefixed [lua]. No client output.

### require(name) → any
live
Loads another script from server script folder by name WITHOUT .lua extension; returns its value.

### registerLuaCommand{ command, roleRequired, exactRole, description, callback }
live
Declares command listed/echoed like built-in. command has NO slash. roleRequired controls /help visibility, NOT permission gate by itself: use hasRole in callback or exactRole. Admin reassignment in game does gate. exactRole allows only exact role (higher refused); owner always passes. description shown in listings. Optional callback f(player,args) runs before onPlayerCommandCallback.
```lua
registerLuaCommand{ command = "card", roleRequired = 0, description = "Open your Credit Card" }
registerLuaCommand{ command = "vipshop", roleRequired = 1, exactRole = true, description = "VIP only, not shown to higher roles" }
```

### getItem(id) → Item or nil
live
nil for unknown id. Guard before getName().

### getItemsCount() → number
live
Total registered items, NOT highest id. Sparse/custom IDs need care.
```lua
for id = 0, getItemsCount() - 1 do
    local it = getItem(id)
    if it and it:getName() ~= "" then print(it:getName()) end
end
```

### getServerPlayers() → {Player}
live
1-based online, login-complete players only; peers still logging in excluded.

### getWorlds() → {World}
live
1-based worlds loaded in memory, NOT every stored world. Key by getName, not index.
```lua
local function findDrops(itemID)
    local hits = {}
    for _, w in ipairs(getWorlds()) do
        for _, d in ipairs(w:getDroppedItems()) do
            if d:getItemID() == itemID then
                hits[#hits + 1] = {world=w:getName(), x=math.floor(d:getPosX()/32), y=math.floor(d:getPosY()/32), count=d:getItemCount()}
            end
        end
    end
    return hits
end
```
Source command example matches "^/finddrop" although fullCommand explicitly has no slash. Prefer the documented no-slash convention.

### getWorld(name) → world or nil
live
Loads from disk if needed. nil if nonexistent. Letters and digits only.

### getPlayer(userID) → Player or nil
extension
Online player by numeric persistent getUserID; round-trips. Re-resolve in timer/async callbacks.

### getPlayerByName(name) → Player or nil
live
Online player by case-insensitive engine lowercased name.

### getServerName() → string
live
server_name config, same as variant macro comparisons.

### saveDataToServer(key, table) → boolean
live
JSON table in server key/value storage using bound parameters; script text cannot reach SQL. Check return.
```lua
saveDataToServer("player_" .. player:getUserID(), { done=true, streak=3 })
```

### loadDataFromServer(key) → table or nil
live
Decoded table or nil absent.
```lua
local d = loadDataFromServer("player_" .. player:getUserID())
if d and type(d) == "table" and d.done then print(d.streak) end
```

### saveStringToServer(key, data) → boolean
live
Same store, raw string, max 1,000,000 bytes.

### loadStringFromServer(key) → string or nil
live
Raw stored string or nil absent.

### sqlite.open(file) → db
live
Database in server folder. db:query/sql and db:close; WAL, 2s busy timeout. Unclosed handles freed on reload.
```lua
local db = sqlite.open("mine.db")
local rows = db:query("SELECT a, b FROM t") or {}
db:close()
```

### db:query(sql) → {row} or nil
live
Array of column-keyed rows. nil on error, {} on no matches. Only raw SQL interface documented; never concatenate untrusted text.

### db:close()
live
Safe twice; subsequent queries nil.

### json.encode(value) → string
live
Same JSON encoder as saveDataToServer.

### json.decode(string) → value or nil
live
nil on malformed input; never raises. json.save/json.all are other engines and NOT present.

### registerLuaPlaymod(modData) → number
live
Registers script playmod, returns id for addMod. Known built-in 203 Grumbleteeth mumbles speech, still allows talking.
```lua
local id = registerLuaPlaymod({ modName="Frost", iconID=274, changeSkin={150,200,255,255} })
player:addMod(id, 0)
player:addMod(203, 600)
```

### addSidebarButton(jsonObject)
live
JSON STRING, baked into login packet.
```lua
addSidebarButton(json.encode({ active=true, name="ProfitButton", buttonAction="open_profit", buttonTemplate="BaseEventButton", itemIdIcon=14404, order=50, rcssClass="daily_challenge", text="Profit" }))
```

### timer.setTimeout(seconds, fn) → number
live
Once after seconds clamped 0-3600; returns handle cancelled by timer.clearInterval. Source example captures player; stronger lifetime rule requires storing userID and re-resolving instead.

### timer.setInterval(seconds, fn) → number
live
Every seconds clamped 1-3600, NOT milliseconds. Keep returned handle to stop it. fn no args; errors logged and do not stop interval.
```lua
local announcer
local function startGiveaway()
    local left = 3
    announcer = timer.setInterval(300, function()
        left = left - 1
        for _, p in ipairs(getAllPlayers()) do p:onConsoleMessage("`2Giveaway`` starting soon!") end
        if left <= 0 then timer.clearInterval(announcer); announcer = nil end
    end)
end
```

### timer.clearInterval(id) → boolean
live
Stops interval OR timeout. True if actually stopped.

### getWorldEffects() → {table}
live
Effect tables plus world name; see world:setEffects fields.

### getPlayerEffects() → {table}
live
Effect tables plus userID.

### getAllPlayers() → {player}
live
Same as getServerPlayers: online/login-complete, 1-based.

### http.post(url, headers, body) → boolean
live
Background POST, discards reply. HTTP/HTTPS only, NO redirects/private addresses. 256 kbps, 20s, 16 concurrent. Optional header table and body max 256 KB. Returns queued boolean, not response.
```lua
http.post("https://discord.com/api/webhooks/ID/TOKEN", { ["Content-Type"]="application/json" }, '{"content":"Giveaway started!"}')
```

### http.get(url, headers) → boolean
live
Background GET, queued boolean, NOT reply. Same limits as post.

### http.request(options) → boolean
live
ONLY HTTP form that reads reply, via callback on server tick after completion, NEVER immediately. options url (http/https), method default GET any verb, headers table, body max 256 KB, callback(res). Same limits as post. res.ok = request completed, even HTTP 404/500; separately check status. status 0 on transport failure. body max 512 KB; larger reply fails entirely. headers usually lowercased, repeated last wins. error only when not ok: timeout, response too large, connection, overload.
```lua
http.request({
    url="https://api.example.com/v1/search?query=love", method="GET",
    headers={ ["Authorization"]="Bearer TOKEN" },
    callback=function(res)
        if not res.ok then print("request failed: " .. tostring(res.error)); return end
        if res.status ~= 200 then print("server said " .. res.status); return end
        print(res.headers["content-type"])
        print(res.body)
    end
})
```

### registerItemWrenchOverride(itemID, function(world, player, tile) end)
live
Opt-in per id. true claims and skips built-in wrench dialog, false/nil lets run.
```lua
registerItemWrenchOverride(1796, function(world, player, tile)
    player:onDialogRequest("add_label|big|`wMy Shop``|left|0|\nadd_button|buy|Buy|noflags|0|0|\nend_dialog|my_shop|||\n")
    return true
end)
```

### registerLockValue(itemID, worldLockValue) → boolean
live
Lock denomination for /toprich and /infowl; inventory AND Extra Backpack count. <=0 removes. Examples (1796,100), (9640,10000).

### addCookingRecipe{ result, ingredients, ... } → boolean
live
False/logs why on impossible recipe. name label; result any item; resultCount default1. ingredients array {id,seconds}; order irrelevant, duplicate id allowed different times. seconds measured Low; Medium x2, High x3. perfectTime total scored separately, <=slowest ingredient seconds; omit/0 ingredients only. minAccuracy default25. ruinedResult omit/0 gives nothing; ruinedResultCount default1. spices exact set for bonus, no slot/timing. spiceBonus default10 added on match, subtracted otherwise. points custom number, engine ignores.
```lua
addCookingRecipe{
    name="Arroz con Pollo", result=4604, perfectTime=40, minAccuracy=25, ruinedResult=4564, points=250,
    ingredients={{id=874,seconds=10},{id=4588,seconds=20},{id=4564,seconds=40}}, spices={4568,4570}
}
```

### getCookingIngredients() → table
live
{id,name,cookTime} accepted by oven; recipes must use these. cookTime 0 never cooks, negative add at last moment, positive normal. Custom recipe need not match time.

### getCookingRecipes() → table
live
Every recipe with original fields for recipe book.

### clearCookingRecipes()
live
Drops every recipe; called automatically on reload so declarations replace.

### setCookingTimerEnabled(enabled) → boolean
live
Default off. Adds Display Timer checkbox. Returns applied value. Shares race clock, overrides race timer; two ovens cannot have two timers. Starts on cook, stops when collected; wrench also counts seconds.

### getCookingTimerEnabled() → boolean
live
Whether ovens offer timer checkbox.

### setHiddenCommands(names) → boolean
live
Cosmetic /help hiding only, commands still run. Replaces set, {} clears, max256. Optional slash accepted in names.

### setLogHiddenNames(names) → boolean
live
Hide growids from drop/take/spawn logs ONLY. Replaces, {} restores all, max256.

### sendLog(text[, category]) → boolean
live
Server line [Lua]+category. text384 chars, category48. default category Lua.

### readLog(category[, limit]) → table
live
Own log category newest first {text,at}. default50 max500.

### setDisconnectRole(roleID) → boolean
live
Force Disconnect in /info. Role rules as setStockAddRole; -1 default2 mod.

### setCrashRole(roleID) → boolean
live
Crash The Game in /info. -1 default2 mod.

### setToprichExcludedRoles(roleIDs) → boolean
live
Hides roles from /toprich using hasRole numbers. Replaces, {} everyone, max64.

### setStockAddRole(roleID) → boolean
live
Who uses machine Add 5000. -1 founder only; 998 staff+, custom500 only500.

### setStockRemoveRole(roleID) → boolean
live
Who uses Remove stocks. Same role rules; -1 founder only.

### setWorldPublicRole(roleID) → boolean
live
Set lock/VIP Entrance public in others' world. Owners unaffected. -1 default.

### setWorldAccessRole(roleID) → boolean
live
Build/access/break others' locks. Owners unaffected. -1 default.

### setDboxTakeRole(roleID) → boolean
live
Take others' Donation Box. Owners unaffected. -1 default.

### setClearDropRole(roleID) → boolean
live
/cleardrop others' world. Owners unaffected. -1 default.

### setAutofarmActionRole(roleID) → boolean
live
Break/plant other blocks while farming. -1 refuses all including founder (default); 0 everyone,998 staff+.

### setAutofarmMaxFar(n) → boolean
live
Blocks punched per player autofarm tick: 1-99, -1 no additional cap (default). Each slot costs edit+broadcast per player per tick.

### onWorldTick(callback) → nil
live
Every world tick per loaded world, arguments(world). Keep cheap, constantly called.

### onPlayerDeathCallback(callback) → nil
live
Arguments(player). Source sendConsole helper is not an engine global.

### onPlayerDropCallback(callback) → nil
live
Arguments(world,player,itemID,count), when item dropped. Source log helper not engine global.

### onPlayerCollectItem(callback) → nil
live
Arguments(world,player,itemID,count), AFTER pickup.

### onPlayerTrashCallback(callback) → nil
live
Arguments(player,itemID,count).

### onPlayerEnterDoorCallback(callback) → nil
live
Arguments(world,player,targetWorldName,doorID).

### onPlayerLeaveWorldCallback(callback) → nil
live
Arguments(world,player).

### onPlayerLevelUPCallback(callback) → nil
live
Arguments(player,newLevel).

### onPlayerWrenchCallback(callback) → nil
live
Arguments(world,player,target), target another player or NPC. true consumes and skips defaults.
```lua
onPlayerWrenchCallback(function(world, player, target)
    world:npcSay(target, "Hello there!")
    return true
end)
```

### world:getPlayers() → table
live
Array of current world players.

### world:getTile(x, y) → tile
live
Tile coordinates. nil outside world despite return annotation.

### world:setTileOnFire(tile, enable) → boolean
live
Lights/extinguishes block; counts world fire limit as real fire.

### world:isTileOnFire(tile) → boolean
live
Whether block burning.

### world:setClothing(player, itemID) → boolean
live
Player or scripted NPC; slot determined by item. Source says item0 removes that slot, but world:unequipAll explicitly says setClothing refuses0. Avoid0; prefer unequipAll to clear clothing.

### world:setPlayerPosition(player, x, y) → boolean
live
Source: "Moves a player or a scripted NPC to a tile position. Alias of world:movePlayer, same arguments and units." Example (npc,20,15). CONTRADICTION: movePlayer explicitly uses PIXELS. Avoid this ambiguous alias; use movePlayer with pixels.

### setCrimeWinChance(percent) → boolean
live
-1 default real card duel, 0-100 replaces with weighted roll. This does not activate onPlayerCrimeCallback (never dispatched).

### getCrimeWinChance() → number
live
-1 real duel, otherwise flat percentage.

### setLockConvertEnabled(enabled) → boolean
live
Lock converting on/off. Default on, restored after reload.

### getLockConvertEnabled() → boolean
live
Current lock conversion state.

### setConvertLabel(fromItem, toItem, toAmount, fromAmount) → boolean
live
Convert button offer ONLY; script must pay out. (7188,13200,1,100) 100BGL->1Rayman. (7188,nil) restores built-in.

### getConvertLabel(fromItem) → table or nil
live
Reads custom offer, nil absent.

### setGhostsEnabled(enabled) → boolean
live
Global ghosts default on, /rs resets. World override wins.

### getGhostsEnabled() → boolean
live
Global ghosts flag, ignores world override.

### setWorldGhostsEnabled(worldName, enabled) → boolean
live
Per-world override, nil removes and follows global.

### getWorldGhostsEnabled(worldName) → boolean or nil
live
World override or nil. getGhostsAllowed for effective answer.

### getGhostsAllowed(worldName) → boolean
live
Effective world flag, override wins.

### clearGhosts(worldName) → number
live
Despawns/counts world ghosts, leaves one already being jar-caught.

### setGhostModePolicy{ worldOwner, worldAdmins, roles, rolePermission, obeyWorldSetting } → boolean
live
nil or /rs restores default. worldOwner true; worldAdmins false; roles list built-in thresholds/custom exact; rolePermission true counts role-editor /ghost; obeyWorldSetting true refuses disabled-world ghosts except owner.

### getGhostModePolicy() → table or nil
live
Current policy or nil default.

### setGhostSpawnConfig{ maxPerWorld, abandoned, event } → boolean
live
Auto spawn default off, nil or /rs off. maxPerWorld1-25 default15. abandoned={enabled,minDays(10),chance(0.25),multiplier}, unvisited world on load. event={enabled,minMinutes(20),maxMinutes(40),count(5),message} in busy world.
```lua
setGhostSpawnConfig{ abandoned={minDays=10,chance=0.25}, event={minMinutes=20,maxMinutes=40,count=5} }
```

### getGhostSpawnConfig() → table
live
Current auto-spawn config.

### spawnGhost(worldName, x, y [, ghostType]) → number or nil
live
Tile coords in LOADED world; id or nil failure. ghostType1(default),4harvest,6shark,7xmas,12mind control.

### getGhostCount(worldName) → number
live
Ghost count loaded world.

### getStockAddRole() → number
live
Add stock role, -1 founder only.

### getStockRemoveRole() → number
live
Remove stock role, -1 founder only.

### getWorldPublicRole() → number
live
Public role, -1 default.

### getWorldAccessRole() → number
live
Override access role, -1 default.

### getDboxTakeRole() → number
live
Donation Box take role, -1 default.

### getClearDropRole() → number
live
/cleardrop role, -1 default.

### getAutofarmActionRole() → number
live
Action while farming role, -1 refused all.

### getAutofarmMaxFar() → number
live
Reach cap, -1 none.

### setRoleEditorRole(roleID) → boolean
live
In-game role editor. -1 founder only. Founder and owner never delegatable.

### getRoleEditorRole() → number
live
Editor role, -1 founder only.

### addCombinerRecipe(item1, amount1, item2, amount2, item3, amount3, resultId, resultAmount) → boolean
live
3 ingredient recipe, same save file as game editor.

### removeCombinerRecipe(index) → boolean
live
Index in getCombinerRecipes. Source example removeCombinerRecipe(0).

### getCombinerRecipes() → table
live
{item1,amount1,item2,amount2,item3,amount3,result,resultAmount} recipes.

## Player
A player handle is valid only for the callback that received it. For delayed work keep getUserID(), then getPlayer(userID), check nil/isOnline inside callback. NPCs are player objects but npc-specific functions are explicitly named.

### npc:move(tileX, tileY) → boolean
live
TILE coords, stands beside solid target.
```lua
npc:move(tile:getPosX(), tile:getPosY())
```

### npc:breakTile(tile [, instant]) → boolean|nil
live
One hit. nil refused, false damaged, true broke.

### player:getPearls() → number
live
Pearls balance.

### player:setPearls(amount) → number
live
Sets/returns new balance, clamp0-2000000000.

### player:addPearls(delta) → number
live
Adds/returns new balance, negative subtracts.

### player:showPearls()
live
Shows Pearls panel.

### player:hidePearls()
live
Hides Pearls panel.

### player:clearPearls()
live
Releases Pearls panel back to engine.

### player:getBackpackUsedSize() → number
live
Backpack slots in use. Source compares >= getInventorySize, though latter described as slots in use too; capacity meaning ambiguous.

### player:onConsoleMessage(text)
live
Client console/chat. Colour codes `2 green, `4 red, `w white, `o default.

### player:onTalkBubble(netID, text [, color])
live
Bubble, explicit netID can target another avatar.

### player:onDialogRequest(text)
live
Dialog markup screen. For generated dialogs, use the following sourcecppalbin syntax rather than guessing another engine's dialog format.

Source: sourcecppalbin/GrowRabbid/Utils/Wrapper/DialogBuilder.cpp (implemented methods), GrowRabbid/Commands/Commands.h (AUTOHARVEST, AUTOCV and other active dialogs), and GrowRabbid/Handle/DialogReturn.h (item picker and returned fields). Only the client markup is reused; these C++ helpers are not Lua bindings. AddTextboxInput is a no-op in the builder and must not be presented as a supported widget. Commented-out methods in DialogBuilder.hpp alone are not evidence of support.

Each instruction occupies one line. Preserve pipe field order and empty fields; join Lua strings with "\n" (an actual newline at runtime), not a literal backslash followed by n. Backticks are client color codes and remain unchanged in Lua strings. Use table.concat(lines, "\n") .. "\n" or a multiline Lua string. The default theme used throughout Commands.h is set_default_color|`o, set_bg_color|43,34,74,200| and set_border_color|112,86,191,255|, unless the user requests other colors.

Source-backed line templates (replace angle-bracket placeholders with values):
```text
set_default_color|`o
set_bg_color|43,34,74,200|
set_border_color|112,86,191,255|
text_scaling_string|<text>
embed_data|<name>|<value>
add_spacer|small|
add_label|big|<text>|left|0|
add_label_with_icon|big|<text>|left|<itemID>|
add_textbox|<text>|
add_smalltext|<text>|
add_text_input|<name>|<label>|<initialText>|<maxLength>|
add_text_input_password|<name>|<label>|<initialText>|<maxLength>|
add_button|<id>|<label>|noflags|0|0|
add_checkbox|<name>|<label>|<0-or-1>|
add_button_with_icon|<id>|<label>|staticYellowFrame|<itemID>|0|
add_item_picker|<name>|<label>|<floatingText>|
add_custom_break|
set_custom_spacing|x:<x>;y:<y>|
add_custom_label|<text>|target:<target>;top:<top>;left:<left>;size:small|
add_quick_exit|
end_dialog|<dialog_name>|<cancelLabel>|<okLabel>|
```
Sizes are small/big. Builder directions are left/right/staticBlueFrame or empty. Active command dialogs also use add_textbox|<text>|left| and add_smalltext|<text>|left|. Prefer the complete add_button form above. Use a unique dialog_name and explicit button IDs; keep end_dialog OK empty when handling explicit buttons. Never expose pipe/newline characters from user-controlled text directly in markup: replace them in a locally defined helper. embed_data is client-returned metadata, not trusted server storage. Validate callbacks as described in onPlayerDialogCallback.

Example opening helper (call inside a documented player callback):
```lua
local function showMenu(player)
    local lines = {
        "set_default_color|`o",
        "set_bg_color|43,34,74,200|",
        "set_border_color|112,86,191,255|",
        "add_label_with_icon|big|`wMy Menu``|left|242|",
        "add_spacer|small|",
        "add_text_input|choice|Choice:||32|",
        "add_button|ok|Confirm|noflags|0|0|",
        "add_quick_exit|",
        "end_dialog|my_menu|Close||",
    }
    player:onDialogRequest(table.concat(lines, "\n") .. "\n")
end
```

### player:onDialogRequestRML(markup)
live
Client RML layout dialog.

### player:sendAction(text)
live
Raw client action packet; oversized refused/logged.

### player:playAudio(file [, delayMS])
live
UI sound; no slash adds audio/ prefix. delay milliseconds.

### player:getName() → string
live
Name WITH colour codes.

### player:getCleanName() → string
live
Colour-stripped name; comparisons.

### player:getRealName() → string
live
Alias getName, compatibility.

### player:getRealCleanName() → string
live
Identical getCleanName.

### player:setName(name) → boolean
live
Persisted display /nick, empty clears. NOT account name; logins/bans unaffected.

### player:getNetID() → number
live
Network id for talk bubbles.

### player:getUserID() → number
live
Persistent account id, storage key, pairs getPlayer().

### player:getWorldName() → string
live
Current world name.

### player:isOnline() → boolean
live
False if disconnected mid-script.

### player:hasRole(n) → boolean
live
Threshold level>=n using server role map. 0player,1vip,2mod,3moderator,4dev,5sdev,998staff,999owner,1000founder. Custom role behavior elsewhere described exact; use server role metadata, do not infer IDs.

### player:getRole() → number
live
Role level plain number.

### player:setRole(level) → boolean
live
SESSION ONLY, resets relog. 0none,1vip,2mod,3moderator,4dev,5superdev.

### player:getRouletteNumber() → number
live
Forced next spin0-36, -1random.

### player:setRouletteNumber(n) → boolean
live
Next spin only. 0-36 force; anything else clears.
```lua
registerLuaCommand{
    command="rig", roleRequired=3, exactRole=true, description="Set a player next spin",
    callback=function(player,args)
        local who,n=args:match("^(%S+)%s+(-?%d+)$")
        if not who then return end
        for _,p in ipairs(getServerPlayers()) do
            if p:getName()==who then p:setRouletteNumber(tonumber(n)) end
        end
    end
}
```

### player:getGems() → number
live
Current gems.

### player:setGems(n)
live
Sets gems and OnSetBux display. Clamp0-2000000000.

### player:addGems(n, ...)
live
Add/subtract and update display. Extra args accepted/ignored legacy.

### player:removeGems(n, ...) → boolean
live
Subtract ONLY if affordable; false leaves unchanged. Check return.

### player:getGemsBank() → number
live
Balance of engine /bank gem bank.

### player:setGemsBank(n)
live
Exact bank balance, negatives0. No packet; bank visible only in dialog.

### player:addGemsBank(n)
live
Add/subtract bank, floor0.

### player:removeGemsBank(n) → boolean
live
Subtract if enough, false unchanged.

### player:depositGems(n) → number
live
Move gems into bank under bank-window rules. Returns amount moved OR nil,reason despite annotation. Prefer this engine transfer for deposit.

### player:withdrawGems(n) → number
live
Move gems out, refuses above2000000000 wallet cap. amount moved OR nil,reason.
```lua
local got,why=player:withdrawGems(5000)
if not got then player:onConsoleMessage("`4" .. why) end
```

### player:getLocksValue() → number
live
All four carried lock denominations totalled in World Locks.

### player:convertLocks(fromItemID, toItemID, count) → number or nil, string
live
Returns received count OR nil,reason. Exact divisibility required; must hold spend count. 242WL,1796DL,7188BGL,8470GGL.
```lua
local got,why=player:convertLocks(7188,8470,100)
player:convertLocks(8470,7188,1)
```

### player:getRubble() → number
live
Event currency, dialogs only, no live display.

### player:addRubble(n)
live
Add/subtract, clamp0-2000000000.

### player:removeRubble(n) → boolean
live
Only subtract affordable, else false unchanged.

### player:updateStats(world, stat, amount [, replace]) → boolean
live
world ignored legacy. amount>=1; cannot set0 or lower once max reached. replace true sets, else adds.
```lua
onPlayerHarvestCallback(function(world,player,tile)
    player:updateStats(world,5,1)
end)
```

### player:getItemAmount(itemID) → number
live
Held item amount or0.

### player:changeItem(itemID, delta [, unused]) → boolean
live
Positive gives, negative takes; client inventory updates. Third ignored legacy.
```lua
if player:getItemAmount(242)+5<=200 then player:changeItem(242,5,0) end
```

### player:giveItem(itemID, amount) → boolean
live
Bulk /spawn path: 200/slot, overflow Extra Backpack, full ordinary inventory is fine. Max2000000000. Check return.
```lua
player:giveItem(242,5000)
```

### player:getInventoryItems() → {InventoryItem}
live
Occupied ordinary slots only; padding skipped.

### player:getBackpackItems() → {InventoryItem}
live
Alias ordinary getInventoryItems, NOT Extra Backpack overflow.

### player:getInventorySize() → number
live
Source description: number of inventory slots in use. Source getBackpackUsedSize example treats it as capacity: unresolved ambiguity.

### player:getExtraBackpack() → {InventoryItem}
live
Overflow store, empty skipped, distinct from ordinary inventory.

### player:getExtraBackpackAmount(itemID) → number
live
Total item across all overflow slots,0 absent.

### player:getItemAmountBackpack(itemID) → number
live
Alias getExtraBackpackAmount, compatibility.

### player:addToExtraBackpack(itemID, amount) → boolean
live
Top up/create overflow slot; capped2000000000.

### player:takeFromExtraBackpack(itemID, amount) → number
live
Removes UP TO amount across slots; returns ACTUAL removed, may be less.
```lua
local took=player:takeFromExtraBackpack(242,500)
if took<500 then player:onConsoleMessage("`4You only had " .. took .. ".") end
```

### player:clearExtraBackpack()
live
Destructive clears entire overflow; no confirmation/return.

### player:getClothingItemID(index) → number
live
Slot0-9 hair,shirt,pants,feet,face,hand,back,mask,necklace,ances. Empty0.

### player:getPosX() → number
extension
PIXELS. One tile32 pixels.
```lua
local px,py=player:getPosX(),player:getPosY()
local tx,ty=tile:getPosX()*32,tile:getPosY()*32
local dist=math.sqrt((px-tx)^2+(py-ty)^2)
```

### player:getPosY() → number
extension
PIXELS, tile:getPosY returns tiles. 32px/tile.

### player:getBlockPosX() → number
live
TILES, already divided32.
```lua
local bx,by=player:getBlockPosX(),player:getBlockPosY()
for _,tile in ipairs(world:getTiles()) do
    if tile:getPosX()==bx and tile:getPosY()==by then player:onConsoleMessage("You are standing on item " .. tile:getTileID()) end
end
```

### player:getBlockPosY() → number
live
TILES.

### player:getType() → number
live
0real, nonzeroNPC.

### player:getPing() → number
live
Milliseconds,0 if disconnected.

### player:getXP() → number
live
Current XP.

### player:setXP(amount) → boolean
live
Exact XP, false negative. For reset setLevel(1) AND setXP(0), or stored XP levels back up.

### player:getLevel() → number
live
Current level.

### player:setLevel(level) → boolean
live
0 becomes1 minimum. Updates level stat. Reset both level and XP.

### player:getPlaytime() → number
live
Total seconds played.

### player:getIP() → string
live
Player IP address; sensitive data.

### player:getCountry() → string
live
Country flag string.

### player:setCountry(country)
live
Alnum/underscore/dash only, max32chars.

### player:setCustomAutofarmDelay(ms)
live
Per-player override0-60000 milliseconds;0 server default.

### player:getCustomAutofarmDelay() → number
live
Override or0.

### player:getAutofarm() → PlayerAutofarm
live
Autofarm handle.

### player:hasMod(modID) → boolean
live
Active playmod check.

### player:addMod(modID [, seconds]) → boolean
live
seconds0 uses mod default. false unknown id.

### player:removeMod(modID) → boolean
live
True if found/removed.

### player:ban(days, hours, minutes, reason [, by]) → boolean
live
Engine ban path; false already banned. hasMod(76) tests. Whole nonnegative time parts sum, cap~730days. Required nonempty reason stored/shown. by optional defaults System, Punish/View attribution. Disconnects.

### player:curse(days, hours, minutes, reason [, by]) → boolean
live
Same time/reason/by rules as ban but sends HELL, no disconnect. hasMod(139) tests.

### player:getCheat(name) → boolean
live
nil unknown name. Valid: autofarm,autocollect,autofish,antibounce,fastdrop,fastpull,fasttrash,speed,jump,double_jump,heat_resist,strong_punch,long_punch,long_build.

### player:setCheat(name, enable) → boolean
live
True ONLY when state actually changed.
```lua
player:setCheat("autofarm",true)
local af=player:getAutofarm()
if af then af:setTargetBlockID(242) end
```

### player:setSkin(r, g, b [, a]) → boolean
extension
Broadcasts skin, alpha255 default; values outside0-255 refused. Default colour130,149,195,255.

### player:getSkin() → r, g, b, a
extension
Stored colour may differ from display override.

### player:setGhostMode(on) → boolean
live
No permission check; script must gate.

### player:isGhostMode() → boolean
live
Current ghost state.

### player:getEffects() → table or nil
live
Player effects on top of world effects.

### player:setEffects(effects) → boolean
live
Persisted across relog. Same world:setEffects table; {} clears.
```lua
player:setEffects({extra_gems=50,extra_xp=25,drops={{id=242,count=1,chance=10}}})
```

### player:deleteEffects()
live
Clear player effects.

### player:onTextOverlay(message [, delay])
live
Large centered banner max4096bytes.

### player:doAction(str)
live
Same sendAction,8192byte guard.

### player:onBackpackUI()
live
Open backpack UI.

### player:enterWorld(worldName [, notification, bypass]) → boolean
live
Name max24chars. notification/bypass ignored here; do not assume permission bypass.

### player:checkPassword(password) → boolean
live
Compare stored password.

### player:disconnect()
live
Dropped AFTER current packet; code after call still runs.

### player:getWorld() → World or nil
live
Current world object or nil, same callback handle.
```lua
local cw=player:getWorld()
if cw then cw:useItemEffect(player:getNetID(),18,0,500) end
```

### player:sendVariant(variantList [, delay, netID])
live
Function name then arguments. delay default-1, netID defaults player. Max16elements,4096byte strings.
```lua
player:sendVariant({"OnEventButtonDataSet","DailyChallenge",0,""})
```

### player:getEmail() → string
live
Account login email; sensitive.

### player:getRID() → string
live
Current device RID; sensitive.

### player:getRIDHistory() → table
live
Distinct RIDs oldest first,max20.

### player:getAltAccounts() → table
live
IP/RID shared accounts {name,matchedBy}. SCANS EVERY SAVE FILE; sparingly, never tick.

### player:getFriends() → table
live
{name,mute,block_trade,last_seen}.

### player:addFriend(name) → boolean
live
Mutually adds ONLINE player bypassing normal request.

### player:getSubscription() → table
live
{tier,expiresAt,active}.

### player:getSubscription(type) → table or nil
live
Overload {type,expireTime} or nil.0Supporter,1Super Supporter,2yearly,3monthly,4Grow Pass,5TikTok,7Staff.

### player:addSubscription(tier, durationSeconds) → boolean
live
Same tier extends, different replaces.
```lua
player:addSubscription("vip",30*86400)
```

## World
Callback world is object, not string. Stores name and re-resolves each call; stale handles fail cleanly.

### world:hasVendingAccess(player, tile) → boolean
live
Owner-side access vs buyer side.

### world:useItemTileEffect(tile, netID, itemID, punchX, punchY) → boolean
live
Tile-anchored item effect.
```lua
world:useItemTileEffect(tile,player:getNetID(),242,1,2)
```

### world:getName() → string
live
World name.

### world:copy(sourceName) → boolean
live
Copies source into this world, EJECTS everyone, keeps destination name.

### world:createNPC(name, x, y) → player or nil
live
Scripted avatar as player object. name max30chars. x/y PIXELS; tiles*32.

### world:findNPCByName(name) → table
live
Array exact-name NPCs,{} absent.

### world:removeNPC(npc) → bool
live
Despawns, false if real player.

### world:npcSay(npc, text) → bool
live
Bubble over NPC to world.

### world:renameNPC(npc, name) → bool
live
Respawns avatar to update name.

### world:spawnItem(x, y, itemID, count) → boolean
live
Ground drop, coordinates TILES per tile:getPosX docs and example. false bad id/count/coords.
```lua
world:spawnItem(tile:getPosX(),tile:getPosY(),242,1)
```

### world:unequipAll(player) → boolean
live
Clears10clothing slots/redraws. Source says setClothing cannot clear because refuses item0; conflicts with that entry. Prefer this function.

### world:updateClothing(player) → boolean
live
Re-send appearance after directly changing clothing fields.

### world:sendPlayerMessage(player, message) → boolean
live
Slash text RUNS COMMAND as player's own permissions; other text console. Max4096bytes. Treat untrusted slash text carefully.

### world:useItemEffect(netID, itemID, secondNetID, delay) → boolean
live
Avatar item-use visual broadcast; delay ignored.

### world:updateTileFor(player, tile) → boolean
live
Only one player gets tile update.

### world:playEffect(effectID, tileX, tileY [, p1, p2, srcNetID]) → boolean
live
TILE effect broadcast. Known ids0,100,500.

### world:playEffectOnEntity(effectID, netID [, p1, p2, srcNetID]) → boolean
live
Effect follows player/NPC.

### world:playVisualEffect(effectID, netID, pixelX, pixelY [, p1, p2, srcNetID]) → boolean
live
netID>0 follows entity;0 PIXEL location.

### world:kill(player) → boolean
live
Respawns via death path, fires onPlayerKillCallback.

### world:getEffects() → table or nil
live
Active world effects or nil.

### world:setEffects(effects) → boolean
live
Sets/saves, stacks server effects. gems_chance/xp_chance percentages default100. {} clears. fields extra_gems,extra_xp,one_hit,gems_chance,xp_chance,break_range,build_range,drops{{id,count,chance}}.
```lua
world:setEffects({extra_gems=100,extra_xp=50,one_hit=true,gems_chance=25,xp_chance=100,break_range=2,build_range=2,drops={{id=242,count=1,chance=5}}})
```

### world:deleteEffects()
live
Clears world effects.

### world:getTiles() → {tile}
live
ALL tiles array; expensive inside hot callbacks. Writable with world:setTileForeground/updateTile/tile:setTileData.

### world:setTileForeground(tile, itemID) → boolean
live
Set foreground; world:updateTile needed to show.

### world:setTileBackground(tile, itemID) → boolean
live
Set background; world:updateTile needed to show.

### world:updateTile(tile) → boolean
live
Broadcast current block after foreground/background edit; NOT tile state setter.

### world:updateTileState(tile, state) → boolean
live
Sets/shows state at once. Replaces WHOLE value, avoid locked tiles. OPEN4194304,CLOSED0.
Source example getWorld/getTile unguarded; add nil checks.

### world:getSizeX() → number
live
Width TILES,0 unloaded.

### world:getSizeY() → number
live
Height TILES,0 unloaded.

### world:getGuildID() → number
live
Guild id or0 none.

### world:getOwner() → string
live
Owner name or empty.

### world:hasAccess(player) → boolean
live
Owner/admin/access-list.

### world:getDroppedItems() → {drop}
live
All ground items; positions PIXELS; divide32 for tiles. Snapshot handles.
```lua
local bx,by=player:getBlockPosX(),player:getBlockPosY()
for _,d in ipairs(world:getDroppedItems()) do
    if math.abs(d:getPosX()/32-bx)<=2 and math.abs(d:getPosY()/32-by)<=2 then
        player:onConsoleMessage("Nearby: " .. d:getItemID() .. " x" .. d:getItemCount())
    end
end
```

### world:removeDroppedItem(uid) → boolean
live
drop:getUID, clears all clients; uid stable only while world loaded.

### world:movePlayer(player, x, y) → boolean
live
Inside own world, no anticheat. x/y PIXELS.
```lua
world:movePlayer(player,tile:getPosX()*32,tile:getPosY()*32)
```

### world:punchTile(tile, player) → boolean
live
Real hand break path. TILE FIRST, PLAYER SECOND.

### world:plantFromMagplant(player, tile) → boolean
live
PLAYER FIRST, TILE SECOND. Linked Magplant5000 seeds decrement. false unless stocked, empty/unlocked/in-world tile, solid directly below.

### world:getMagplantStock(player) → number
live
Linked Magplant5000 seed stock,0none.

### world:getMagplantSeed(player) → number
live
Linked seed item id,0none.

### world:findPathByTile(startX, startY, endX, endY) → table
live
Native A*, TILE coords, ordered{x,y} path,{} unreachable. Source example passes npc:getPosX/Y (player pixels), contradicts units: convert /32 or use block positions.

### world:getTilesByActionType(actionType [, maxAgeMs]) → table
live
Tiles cached by item actionType. maxAgeMs default2000 milliseconds.

### world:getCached(actionType) → table
live
Same getTilesByActionType, default freshness.

## Tile
Break/wrench callback tiles are READ-ONLY snapshots; block zeroed afterwards. world:getTiles handles carry world and can be written.

### tile:getTileItem() → item
live
Foreground block item object.

### tile:getTileID() → number
live
Foreground if present, otherwise background (what was broken).

### tile:getTileForeground() → number
live
Raw foreground id.

### tile:getTileBackground() → number
live
Raw background id.

### tile:getFlags() → number
live
Raw flag bits.

### tile:setFlags(flags) → boolean
live
Stages flags; world:updateTile writes/broadcasts. false on worldless snapshot.

### tile:getMountedFish() → number or nil
live
Wall mount fish,0empty,nilwrong type.

### tile:getMountedWeight() → number or nil
live
Weight lb; fish weight equals held count.

### tile:getMountedName() → string or nil
live
Plaque nickname,empty unnamed.

### tile:setMountedFish(id, weight) → bool
live
Immediate, no updateTile.0empties; weight<=200lb.

### tile:setMountedName(name) → bool
live
Max30chars, fails empty plaque.

### tile:getVendingItem() → number or nil
live
Vending/DigiVend selling id,0empty,nilnot vending.

### tile:getVendingCount() → number or nil
live
Stock count.

### tile:getVendingPrice() → number or nil
live
Positive locks/item, negative items/lock,0not for sale.

### tile:getVendingEarnings() → number or nil
live
Unwithdrawn WL, READ ONLY.

### tile:setVending(id, count, price) → bool
live
Immediate. id0empties,forces count/price0. count negative0, above capacity clamped. price>0 up to2000000WL/item; price<0 magnitude<=200 AND<=count;0off. Invalid price refused with no write.
Source command compares cmd=="/shop"; use "shop" per callback contract.
```lua
local t=world:getTile(player:getBlockPosX(),player:getBlockPosY()-1)
if t and t:getVendingItem() then t:setVending(2,500,2) end
```

### tile:getPosX() → number
live
TILES. Feed directly world:spawnItem.

### tile:getPosY() → number
live
TILES.

### tile:getTileData(index) → number or nil
live
0fruit count TREES only;1start timestamp TREES/PROVIDERS;nilnot applicable.
```lua
for _,t in ipairs(world:getTiles()) do
    local fruit=t:getTileData(0)
    if fruit and fruit>0 then print(fruit) end
    local started=t:getTileData(1)
    if started then
        local it=getItem(t:getTileID())
        if it then print(started+it:getGrowTime()-os.time()) end
    end
end
```

### tile:setTileData(index, value) → boolean
live
0fruit0-255 trees;1cycle-start timestamp trees/providers. Same gating as get.

### tile:setTileDataInt(index, value) → boolean
live
Alias setTileData.

## Drop
world:getDroppedItems snapshots readable after pile gone. Re-read list instead of holding stale drop.

### drop:getItemID() → number
live
Pile item id.

### drop:getItemCount() → number
live
Pile count.

### drop:getPosX() → number
live
PIXELS, divide32 for tiles.

### drop:getPosY() → number
live
PIXELS, divide32 for tiles.

### drop:getUID() → number
live
Pile id only stable while world loaded.

## BinaryWriter
From BinaryWriter(). All Write methods return writer and can chain.

### writer:WriteUInt8(n) → BinaryWriter
live
One byte.

### writer:WriteUInt16(n) → BinaryWriter
live
Two bytes little-endian.

### writer:WriteUInt32(n) → BinaryWriter
live
Four bytes little-endian.

### writer:WriteString(s) → BinaryWriter
live
Raw bytes, NO length prefix.

### writer:GetCurrentString() → string
live
Everything written.

### writer:Length() → number
live
Byte count.

### writer:Clear() → BinaryWriter
live
Empties.

## Item
Obtained from getItem(id); nil-check unknown id.

### item:getName() → string
live
Item name.

### item:getRarity() → number
live
Rarity.

### item:getID() → number
live
Item id.

### item:getDescription() → string
live
Never empty; default "This item has no description."

### item:getMachineCap() → number
live
Magplant capacity,0other.5638MAGPLANT5000 default5000;9850(15K)15000;10266(100K)100000;5930Legendary500000;21220Mythical3000000.

### item:setMachineCap(value) → number or nil
live
Applied value or nil no own capacity.

### item:getFarmability() → boolean
live
Farmable tree/seed product.

### item:getGrowTime() → number
live
Seed/tree seconds,0otherwise.

### item:getMinFruitDropCount() → number
live
1farmable,0otherwise. Shared growth range, not per-item.

### item:getMaxFruitDropCount() → number
live
5farmable,1rarity999,0otherwise.

### item:getInfo() → {string}
live
Property lines: wrenchable,multi-facing,untradeable,no-self,never-drops-seeds;{}none.

### item:getActionType() → number
live
Behavior action type,0unset.

### item:isBlacklisted() → boolean
live
No-/Buy flag, pairs onBlacklistAccessCallback.

## InventoryItem
From getInventoryItems/getBackpackItems/getExtraBackpack.

### invItem:getItemID() → number
live
Slot item id.

### invItem:getItemCount() → number
live
Slot count.

## PlayerAutofarm
From player:getAutofarm().

### autofarm:getSlots() → number
live
Current slot count.

### autofarm:setSlots(n) → boolean
live
False out of range; exact range not documented.

### autofarm:getTargetBlockID() → number
live
Target block0none.

### autofarm:setTargetBlockID(itemID) → boolean
live
Sets target, DOES NOT enable autofarm.
```lua
local af=player:getAutofarm()
if af then af:setTargetBlockID(242) end
```

## Profile & Store
Names in this entire category exist ONLY after registering onPlayerProfileRequest or onStoreRequest. Without such a script the names do not exist. This includes the stub entries below.

### getStoreItems() → table
live
All storeItem objects.

### getTopPlayerByBalance() → topPlayer or nil
live
Richest from last /toprich; nil until someone runs it.

### formatTime(endTime, now) → string
live
"1 days, 2 hours, 5 minutes, 7 seconds".

### formatStoreTime(endTime, now) → string
live
"1d 2h 5m 7s".

### getMaxLevel() → number
live
1000.

### getAchievementsCount() → number
live
Achievement count.

### getRealGTItemsCount() → number
live
Higher item ids custom.

### getCurrentServerEvent() → number
live
3Halloween,4Night of Comet,5Harvest,else0.

### getCurrentServerDailyEvent() → number
live
40Geiger,42Surgery,else0.

### getEasterEggs(userID) → number
live
Online player's Magic Eggs used,0offline.

### getCurrencyLongName() → string
live
"Pearl".

### getCurrencyMediumName() → string
live
"Pearls".

### getCurrencyIcon() → string
live
Empty string.

### getWorldByName(name) → world or nil
live
Same getWorld(name), but this alias is profile/store gated.

### world:getVisiblePlayersCount() → number
live
Non-invisible players.

### tile:getNote() → string
live
Music note row A-G.

### string:getName() → string
live
Name string (e.g. getOwner): itself.

### string:getCleanName() → string
live
Name string without colours.

### player:getMods() → table
live
Active mod objects.

### player:getOnlineStatus() → number
live
0online,1busy,2away.

### player:getGuildID() → number
live
Guild0none.

### player:getRequiredXP() → number
live
Next level XP.

### player:getAccountCreationDateStr() → string
live
Days since account created.

### player:getHomeWorldID() → string or 0
live
Home world NAME for getWorld,0none.

### player:getUnlockedAchievementsCount() → number
live
Finished achievement count.

### player:getStats(stat) → number
live
Untracked0. stat0blocks placed,1trees harvested,2blocks smashed,21surgeries.

### player:getTotalWorldLocks() → number
live
Locks in WL.

### player:getProfileGuildInfo() → string
live
Built-in guild lines.

### player:getProfileGuildJoinButton() → string
live
Guild invite button if any.

### player:getProfileAccessButton() → string
live
Lock access button if any.

### player:getTransformProfileButtons() → string
live
Special worn-item menu buttons e.g.Rift Cape.

### player:getSubscriptionInfo() → string
live
Built-in Moderator/VIP lines.

### player:getClassicProfileContent(cat, flags) → string
live
Built-in profile inner tab; buttons keep working. cat1level rewards,2skills(empty),3goals,4titles,5cheats,6locked worlds.

### player:onGrowmojiUI()
live
Growmoji list.

### player:onNotebookUI()
live
Notebook.

### player:onBillboardUI()
live
Billboard editor.

### player:onOnlineStatusUI()
live
Online status picker.

### player:onPersonalizeWrenchUI()
live
Profile personalizer.

### player:onGrowpassUI()
live
Grow Pass window.

### player:onGrow4GoodUI()
live
Grow4Good tasks.

### player:onAchievementsUI([target])
live
ALWAYS caller's own achievements.

### player:onTitlesUI([target])
live
ALWAYS caller's own title picker.

### player:onWrenchIconsUI([target])
live
ALWAYS caller's own wrench icon picker.

### player:onNameIconsUI([target])
live
ALWAYS caller's own name icon picker.

### player:onClothesUI([target])
live
What target IN SAME WORLD wears.

### player:onTradeScanUI()
live
Trade history.

### player:onRedeemMenu()
live
Redeem code window.

### player:onStoreRequest(text)
live
Store screen, NO4096byte limit.

### player:onStorePurchaseResult(text)
live
Store purchase result.

### player:canFit(items) → boolean
live
Store fit rules, {{itemID,count},...}; stack<=200, each new item needs free slot.

### player:isMaxInventorySpace() → boolean
live
Maximum backpack size reached?

### player:upgradeInventorySpace([slots]) → boolean
live
Adds slots default10, max477. DOES NOT charge.

### player:updateGems()
live
Resend counter, no balance change.

### player:getCoins() → number
live
Pearls.

### player:removeCoins(amount) → boolean
live
Takes Pearls, false insufficient.

### storeItem:getItemID() → number
live
Buy id, named packs negative.

### storeItem:getTitle() → string
live
Title.

### storeItem:getDescription() → string
live
Description.

### storeItem:getItemsDescription() → string
live
"You Get" text.

### storeItem:getTexture() → string
live
Button texture file.

### storeItem:getTexturePosX() → number
live
Texture column.

### storeItem:getTexturePosY() → number
live
Texture row.

### storeItem:getPrice() → number
live
Gems/Growtokens/voucher price.

### storeItem:isGrowtoken() → boolean
live
Growtoken cost?

### storeItem:isVoucher() → boolean
live
Voucher cost?

### storeItem:getCategory() → string
live
main,locks,itempack,bigitems,token.

### storeItem:getRequiredEvent() → number
live
Always-1 none needed.

### storeItem:getItems() → table
live
{{itemID,count},...}; random packs list pool.

### storeItem:makePurchaseItems(count) → table
live
Rolls contents for count purchases1-100 now.

### mod:getID() → number
live
Mod id.

### mod:getName() → string
live
Mod name.

### mod:getDescription() → string
live
Mod message.

### mod:getItemID() → number
live
Icon item.

### mod:getExpireTime() → number
live
Unix expiry,0never.

### topPlayer:getName() → string
live
Player name.

### topPlayer:getCleanName() → string
live
Colour-stripped name.

### topPlayer:getUserID() → number
live
Persistent id.

### topPlayer:getTotalWorldLocks() → number
live
WL balance.

### world:isGameActive() → boolean
stub
Always false. No world games here.

### world:onGameWinHighestScore()
stub
Accepted, does nothing.

### storeItem:isRPC() → boolean
stub
Always false.

### player:getDiscordID() → string
stub
Always "0", no Discord link.

### player:getCardBattleInfo() → string
stub
Always empty.

### player:onGuildNotebookUI()
stub
Accepted, does nothing.

### player:onFavItemsUI()
stub
Accepted, does nothing.

### player:onLinkDiscordUI()
stub
Accepted, does nothing.

### player:onUnlinkDiscordUI()
stub
Accepted, does nothing.

### player:onVouchersUI()
stub
Accepted, does nothing.

### player:onMentorshipUI()
stub
Accepted, does nothing.

### player:onGrow4GoodDonate()
stub
Accepted, does nothing.

### player:progressQuests(itemID, count)
stub
Accepted, does nothing.

### getCorruptedSouls(userID) → number
stub
Always0.

### getEasterBuyTime(userID) → number
stub
Always0.

### getIOTMItem(itemID) → nil
stub
Always nil.

### getEventOffers() → table
stub
Always{}.

### getActiveDailyOffers() → table
stub
Always{}.

### getSpecialStoreItems(player) → table
stub
Always{}.

### isDailyOfferPurchased(userID, itemID) → boolean
stub
Always false.

### addDailyOfferPurchased(userID, itemID)
stub
Accepted, does nothing.

## Not dispatched yet
Accepted so imported scripts load; NOTHING invokes these handlers. Everything not marked stub elsewhere is live; absent names are unknown globals that abort the callback.

### onPlayerDNACallback(function(world, player, resultID, resultAmount) end)
not_dispatched
Source status stub. Registered, never called.

### onPlayerCrimeCallback(function(world, player, rewardID, rewardAmount) end)
not_dispatched
Source status stub. Registered so scripts load, never called; no crime activity here to reward. world=earned world, player=recipient, rewardID and rewardAmount. setCrimeWinChance existing does not make this callback fire.

### onPlayerCardBattleCallback(function(world, player, targetPlayer, rewardID, rewardAmount) end)
not_dispatched
Source status stub. Registered, never called; no card battles here to reward. targetPlayer opponent or nil if left.

### onPlayerEarnGrowtokenCallback(function(world, player, itemCount) end)
not_dispatched
Source status stub. Registered, never called.

### onPlayerHarmonicCallback(function(world, player, tile, itemID, itemCount) end)
not_dispatched
Source status stub. Registered, never called.
