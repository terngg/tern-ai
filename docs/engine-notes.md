# Interpretation of the supplied engine documentation

The source is the owner's pasted GTPS Hosting engine page, not another server's API.
The Markdown reference preserves every entry and overload, normalizing formatting and
condensing repetitive prose/examples. It is not a byte-for-byte HTML archive.

Explicit signatures, descriptive contracts, and lifecycle rules outrank examples when
examples contradict them. Known conflicts are retained beside the affected entries:

- `onPlayerCommandCallback` supplies commands without `/`; several examples match `/`.
- `world:setPlayerPosition` says tiles and also aliases pixel-based `movePlayer`.
  Prefer `movePlayer` with pixels; do not guess the alias's units.
- `world:setClothing` claims item 0 removes clothing; `unequipAll` says 0 is refused.
  Prefer the explicit `unequipAll` operation for clearing clothing.
- `findPathByTile` takes tiles, but its example passes pixel player/NPC positions.
- The timeout example holds a callback player handle past its documented lifetime.
  Store user ID and resolve with `getPlayer` in the delayed callback instead.
- `sendConsole`, `log`, `stash`, `skip`, `showWelcome`, `saveMyState`, and
  `player:updateHealth` appear in examples without standalone definitions. Do not
  whitelist them as engine APIs. Define local helpers when needed.
- `enableCaching` is labelled live but explicitly a no-op; validator rejects relying on it.
- `getInventorySize` and `getBackpackUsedSize` descriptions conflict with the example's
  capacity comparison. Prefer operation return values instead of assumed capacity math.
- Profile & Store APIs require profile/store callback registration, even if individually live.
- The two `getSubscription` signatures are overloads and must both survive indexing.
- The `onPlayerSendRaw notes` entry is metadata, not an additional callable function.

Lua syntax is parsed as Lua 5.3 by luaparse, without executing scripts. The source page
does not specify the engine's Lua version; do not claim support for Lua 5.4-only syntax.
Static analysis checks known calls, inferred handle aliases, arity where documented,
and selected dangerous patterns. Dynamic dispatch and runtime semantics are not provable
without the actual engine. Runtime testing remains necessary before deploying scripts.
