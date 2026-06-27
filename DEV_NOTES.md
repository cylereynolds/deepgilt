# Deepgilt — Dev Notes

Running log of systems and design decisions. (The granular, blow-by-blow build history also
lives in this project's Claude Code memory — launch Claude from `~/Desktop/deepgilt` to load it.)
See also `ARCHITECTURE.md`, `DESIGN.md`, `COMBAT_RESOLUTION.md`, `ATTRIBUTION.md`.

## Hard constraints (non-negotiable)
- **Clean-room vs OpenDiablo2.** OD2 (GPL-3.0) is an *architecture-only* reference. Never copy its
  code; never embed D2/OD2 data or assets. Reimplement concepts (A*, COF animation idea, light
  radius, chunk/socket map assembly) from scratch.
- **Balance from Diablo II: LOD 1.14d ONLY.** Never D2R, never community mods. SRD 5.1 content is
  usable with attribution (see `ATTRIBUTION.md`) but never copy Blizzard Diablo content.
- **No D2 names in shipped content.** Base items, zones, monsters use our own names (the
  `ARPG_Original_BaseItems.csv` set is original/non-D2). Lore = the Wright / gilt / the Gilded / the Hollow.

## Layout
- `client/` — the game. Plain ES5 script tags; engine math on `window.DG` (`engine.js`), modular
  client systems on `window.DGC` (`client/dg/{common,core}/`). Main game is one IIFE in `index.html`.
- `engine.js` — JS port of the Python sim (`engine/`); the formula layer (derived stats, combat,
  loot, armor defense, gear aggregation). Python package is source of truth.
- `client/baseitems.js` — `window.BASE_ITEMS`, generated from `ARPG_Original_BaseItems.csv`.
- `serve.py` — dev server on :8138 (no-store + injected live-reload). `tools/leonardo.py` — art gen.
- Dev shortcut: `index.html?class=bonewright` skips class select; `?bright` disables the torch/darkness.

## Map generation — chunk & socket (`client/dg/core/chunkgen.js`)
- Clean-room reimplementation of D2's chunk/socket assembly: macro-grid of prefab chunks joined by
  edge-matching socket masks (N/E/S/W bits), seeded mulberry32 (seed → identical map), and a
  Left/Right/Straight orientation rule (`exitFacing = rotate(entranceFacing, {straight:0,right:+1,left:-1})`).
- `genDungeon()` = biased randomized-DFS maze (branch weighting pushes the exit into the predicted
  quadrant = the hug-left/right solvability). `genWilderness()` = bordered field + opposite-edge
  entrance/exit + weighted-A* meandering road + POIs. `rasterize(CS)` bakes the macro-grid into the
  engine's 0/1 tile grid; dungeon = chambers/corridors inside wall rings with socket doorways,
  wilderness = one continuous open field.
- `MapEngine.generateChunk({kind,...})` runs ChunkGen, rasterizes, and stamps it into the engine's
  existing contract (`rooms[0]`=spawn, `exitRoom`=portal/boss, `specials`=guardian/treasure).
- **Per-zone size** lives on the `ACT1[]` table in `index.html`: each zone has `gen` (`open`|`maze`),
  `gw`/`gh` (engine grid, kept `gw+gh ≤ ~152` so the whole-map ground prerender stays under browser
  canvas limits), and `den` (tiles-per-mob). Wilderness = big sparse; boss arenas = small dense.
- **Town** = `generateTown()` (currently 56×40): a centered plaza filling the grid with shops around
  the edges; Bezel the merchant + 4 braziers. NO rift — descend via the granted Portal skill.

## Monster AI (the `step()` loop in `index.html`)
- **Packs** (`zonePacks`): D2-MonDen population — target mobs = `floor(totalFloorTiles / zone.den)`,
  placed as packs (leader + 3–5 synergy minions tight around it). `snapWalk` keeps spawns off walls.
- **Aggro = sense + sight.** Wake if `el < PROX(240, ~5 tiles)` (SENSE — through walls; the iso view
  sees over walls so pure-LoS felt "blind") OR `el < AGGRO(640, ~13 tiles) && hasLoS` (SIGHT). Far
  mobs behind walls stay shielded.
- **Separation**: awake mobs spring apart (radius `SEP_R=18`, wall-safe via `tryMove`) so a chasing
  pack reads as a group, not one sprite. Bosses anchored.
- **D2 procs**: Crushing Blow (% of CURRENT hp), Deadly Strike (folds into the crit double-damage
  roll), Open Wounds (unmitigable bleed), Stagger (a hit ≥ maxhp/12 stuns). Maiden = §43 super-regen
  stopped only by Open Wounds + poison nova.
- ⚠️ **Gotcha (fixed):** `makeMon` MUST init `e.stun = 0`. The move/attack gates are `en.stun <= 0`,
  and `undefined <= 0` is false — an uninitialized stun froze awake mobs until first staggered.

## Item system
- **Bases** (`buildBases` from `BASE_ITEMS`): per-slot pools with `minIlvl` (rank within class/tier →
  Act 1 only rolls Normal tier; Exceptional/Elite seeded for later acts), per-base damage (weapons)
  or armor range (armor), `WSM`, `Weight_Class`, `Req_Str/Req_Dex`. Rings/amulets keep our flavor set.
- **Affixes** (`data/affixes.json`, rolled by `DG.rollItem`): ilvl-gated tiers; the drop rolls at
  `ilvl = aLvl*6` so high tiers gate by area level. Display name = `<prefix> <base> <suffix>`.
- **Required level** (`it.req`) = max(base minIlvl, highest rolled affix-tier req via `REQ_BY_TIER`).
- **Physical reqs**: `Req_Str/Req_Dex × 0.5 → Might/Finesse` (`it.reqMight/reqFinesse`). Equip gated on
  Level + Might + Finesse vs `totAttrs` (gear +attr counts). Attributes grow via stat points (below).
- **Armor defense** = D2 LOD 1.14d `DG.armorDefense(...)`: %ED (`armor_pct`) applies to the BASE only
  (native-tier seed = base_max+1), ethereal ×1.5, flat `armor` added AFTER. Per-item, summed into
  `derived.armor`. (Replaced the wrong global `armor × (1+ΣED%)`.)
- **WSM** (Weapon Speed Modifier): scales the attack cooldown (`acd = 32×(1+WSM/100) ÷ IAS`).
  **Weight_Class** (Light/Medium/Heavy): Medium −5% / Heavy −10% movement (stacks, in `hero.recompute`).
- **Spectral** (= Ethereal, ~6% of weapon/armor drops): +50% base def/dmg (UPSIDE); ½ durability +
  CANNOT be repaired (DOWNSIDE — so a broken Spectral is gone for good). Waives physical reqs. CAN be
  socketed/reforged (only durability differs).
- **Durability + repair + broken**: weapons/armor have `maxDur/dur` (`DUR` table; rings/amulets none).
  Weapon wears per swing/cast, armor per hit taken. At 0 dur an item is **Broken** = provides NO stats
  (`DG.isBroken` → `itemDefense`=0, `gearFromItems` skips it, weapon → 1–2 dmg) until repaired. Bezel
  "Repair all" button (town only) restores dur for `ceil(missingDur × (30 + iLvl×8))` bronze; Spectral
  excluded.
- **Jewelry** (ring/amulet) is never plain white — minimum Magic.

## Character
- **Stats per level**: each level-up grants **5 stat + 1 skill point** (`hero.gainXP`). Stat points
  spent in the character sheet (`+` per attribute → `hero.allocStat`). Skill points bank for the
  future skill trees (not built yet). Class base attrs are fixed at creation; allocation is the growth.
- Attributes: Might (phys dmg, str-reqs), Finesse (accuracy/evasion/crit, dex-reqs), Vigor (life),
  Wit (charge), Wyrd (bind/geas/gilt-sight = Magic Find).

## Economy / town
- Bronze/Silver/Gold (1000b = 1s, 100s = 1g). Bezel buys (Sell / Sell-all) and does artisan work in
  town: Reforge (reroll affix values), Punch Socket (insert a gem), Repair all.
- Magic Find = `gilt_sight`; top-down rarity roll (Rare→Magic→Socketed→Normal) with `effRareMF` curve.

## Tuning knobs (quick reference)
- Aggro: `AGGRO` (sight 640), `PROX` (sense 240). Separation: `SEP_R` (18).
- Packs: `zone.den` (tiles/mob), `MAX_MOBS`. Map size: per-zone `gw/gh`, chunk `CS`.
- Items: affix gate `aLvl*6`, `REQ_BY_TIER`, physical-req `×0.5`, `DUR` per slot, wear chances
  (0.18 weapon / 0.25 armor), repair cost `(30 + iLvl×8)`, Spectral roll `0.06`.

## Act 1 — open items
- Difficulty/level tuning so the 14-zone climb actually preps you for the aLvl-11 Maiden.
- Per-zone WALL art (floors are themed; walls are still uniform stone).
- Skill trees (skill points already bank). Persistent stash/wallet across runs (prestige loop).
