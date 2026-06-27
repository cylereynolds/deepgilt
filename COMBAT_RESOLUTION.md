# Combat Resolution — reference note

Reference math for Deepgilt's hit/defense layer, derived from **Diablo II: LOD
patch 1.14d** legacy mechanics (the balance bible's canonical source). Per
[DESIGN.md §1], the **math is taken freely** (unprotectable: "stat/damage/resist
math, D2 % + D&D concepts"); only nouns are reskinned. No Blizzard item names,
assets, or data appear here — just the formulas, mapped onto Deepgilt's stats.

Companion to [DESIGN.md §9] (combat math) and [DESIGN.md §2] (derived stats).

**Both formulas are already implemented:**
- Formula A (hit chance) — JS client `DG.hitChance` ([`client/engine.js`](client/engine.js)) **and** Python server-authoritative `combat.hit_chance` ([`engine/combat.py`](engine/combat.py:5)).
- Formula B (per-piece armor) — JS client `DG.armorDefense` / `DG.itemDefense` ([`client/engine.js`](client/engine.js:261)), summed into `derived.armor` in [`client/dg/core/hero.js`](client/dg/core/hero.js:40), shown as "Defense: N" in [`client/index.html`](client/index.html:724). **Mirrored in Python** as `items.armor_defense` / `items.item_defense` ([`engine/items.py`](engine/items.py)), summed in the `derived.armor` override in [`engine/character.py`](engine/character.py:21) — a line-for-line port, verified equal to the client on the 1.14d vectors below.
  - ⚠️ **Server wiring gap (not a formula gap):** [`server/server.py`](server/server.py:165) still builds players with empty gear (`stats.derived(attrs, 24, cls, {})`), so server armor is 0 today. When it equips real armor it must go **through `Character`** (or sum `items.item_defense`) — not a fresh naive sum — or the drift returns.

> **NOT D2R, NOT mods.** 1.14d only, as inspiration, per the balance bible.

---

## The resolution pipeline (order matters)

For one attack, resolve in this order — each step gates the next:

```
1. To-hit      roll d100 vs HitChance(Acc, Eva, aLvl, dLvl)   → miss ends it
2. Block       if shield & d100 < Block%                       → negated (Finesse-timed)
3. Crit        if d100 < CritChance  (Deadly Strike folds in)  → set mult = CritMult
4. Damage roll roll each damage packet (steel + 5 aspects)
5. Mitigate    steel  → ×(1 − physDR(Armor, aLvl))            [Armor, cap 85%]
               aspect → ×(1 − resist%/100)                     [per-type, cap 75%]
6. Saving throw any rider CC lands only if d100 + Save < DC
```

This note covers **steps 1 and 5** — the two "defense" formulas. Block/crit/save
live in [DESIGN.md §9] (`resolveAttack` / `savingThrow`).

---

## Formula A — Chance to Hit  (D2 "Attack Rating vs Defense")

```
HitChance% = clamp( 100 · Acc/(Acc+Eva) · 2·aLvl/(aLvl+dLvl),  5, 95 )
```

| Term | Deepgilt stat (§2)                         | D2 1.14d term |
|------|-------------------------------------------|---------------|
| `Acc`  | **Accuracy** = Finesse·1.5 + level + weaponSkill | Attack Rating |
| `Eva`  | **Evasion**  = Finesse·1.0 + level·0.5            | Defense (DR)  |
| `aLvl` | attacker level                                   | aLvl          |
| `dLvl` | defender level                                   | dLvl          |

**Two independent factors, multiplied:**
- `Acc/(Acc+Eva)` — the stat contest. Equal Acc and Eva ⇒ 50%.
- `2·aLvl/(aLvl+dLvl)` — the level contest. **Equal levels ⇒ exactly 1.0** (no
  effect). Higher-level attacker > 1.0; lower-level attacker < 1.0.

**Clamp:** hard **5%–95%**. Never auto-hit, never auto-miss.

**Evasion = 0 cases** (defender treated as `Eva = 0` ⇒ attacker hits at the 95%
cap):
- defender is **running** (movement drops Evasion to 0),
- defender is **stunned / in hit-recovery / knocked back / unaware** of the attacker.
- **Block does *not* zero Evasion** — block is a separate, later check (step 2).

**Worked example** — Acc 2000, Eva 1000, both level 80:
```
100 · (2000/3000) · (2·80/160) = 100 · 0.6667 · 1.0 = 66.7%  → 67%
```
Same matchup, defender running ⇒ Eva 0 ⇒ `100 · (2000/2000) · 1.0 = 100%` → clamp **95%**.

---

## Formula B — Per-piece Armor value  (D2 "armor Defense" build)

How a single gear piece's armor number is built before it sums into the
character's **Armor** stat (`Armor = Σ DG.itemDefense(gear)`, §2 / hero.js).
Source: the 1.14d armor-defense generation rule.

```
seed     = base armor for the piece                   (see "seed rule")
qSeed    = floor(seed · 1.5)   if the piece is Spectral, else seed   (×1.5 quality, FLOORED first)
value    = floor( qSeed · (1 + ED%/100) + flat )      (enhanced-% then flat, all floored)
```

**Order of operations is exact** (each `floor` matters):
1. apply the ×1.5 quality bonus to the base, **floor it**,
2. multiply by `(1 + EnhancedDefense%/100)`  — `%ED hits the BASE only`,
3. add `flat +armor`  — **flat is added AFTER the %ED multiply**,
4. **floor** the whole thing.

> The "%ED hits base only, flat added after" ordering is the **key fix** over the
> naive `armor·(1 + ΣED%)` — it's why this is its own function, not a global multiply.

If a piece has **no Enhanced-Defense%** (`ED% = 0`), skip the multiply: just
`value = qSeed + flat`.

**Seed rule** (matches `itemDefense` in engine.js):
- **No `%ED`:** seed from the item's actual rolled base defense `it.base.roll` ∈
  `[amin, amax]`.
- **`%ED` present:** native-tier seed is **fixed at `amax + 1`** (a fixed-roll piece
  doesn't vary its base; the spread, if any, comes from the `%ED` range).
- An upgraded-into-higher-tier piece would use that tier's `[amin, amax]` (`nativeTier=false`).

**Worked example** — base armor `100–116` (the verified in-game vectors):

| Piece | Result |
|---|---|
| plain base, no %ED | `[100, 116]` |
| +50% ED, +10 flat, native | `floor((116+1)·1.5) + 10 = 175 + 10` = **185** |
| **Spectral**, no %ED | `[floor(100·1.5), floor(116·1.5)]` = `[150, 174]` |
| **Spectral**, +50% ED | `floor(floor((116+1)·1.5)·1.5)` = `floor(175·1.5)` = **262** |

Live function ([`client/engine.js`](client/engine.js:261)):
```js
function armorDefense(baseMin, baseMax, edMin, edMax, flatMin, flatMax, ethereal, nativeTier) {
  function eth(x) { return ethereal ? Math.floor(x * 3 / 2) : x; }          // floor(x * 1.5)
  if (edMax === 0) return [eth(baseMin) + flatMin, eth(baseMax) + flatMax]; // no %ED → base range + flat
  var seedMin = nativeTier ? (baseMax + 1) : baseMin, seedMax = nativeTier ? (baseMax + 1) : baseMax;
  return [Math.floor(eth(seedMin) * (100 + edMin) / 100) + flatMin,
          Math.floor(eth(seedMax) * (100 + edMax) / 100) + flatMax];
}
```

### Spectral = Deepgilt's "Ethereal" (locked, DESIGN decision 2026-06-15)
The `ethereal` flag above **is** Spectral. The full package:
- **~5% drop chance**, **+50% base power** (this ×1.5 — armor here, weapon damage elsewhere),
- **cannot be reforged or socketed**, **−50% vendor value** — a coveted glass-cannon chase base.

⚠️ **Currently dormant in the live game:** no item sets `it.ethereal` yet (Spectral
itemization deferred), so the ×1.5 branch never fires in play. When Spectral lands,
the math above is already wired — just set the flag. *(The loot-economy widgets still
roll an older ~12% pure-downside Spectral; update those to ~5% + the +50% upside.)*

---

## ⚠️ Where Deepgilt diverges from raw 1.14d (design intent)

1. **Defense is split into two stats.** In D2, the single *Defense* number both (a)
   reduces chance-to-hit **and** is the only thing armor does. Deepgilt splits it:
   - **Evasion** (Finesse-driven, §2) → feeds Formula A's `Eva` term.
   - **Armor** (Σ `itemDefense`, Formula B) → feeds **physical DR**, *not* the hit roll.

   So the Formula-B number that D2 plugs into to-hit instead routes into Deepgilt's
   `physDR = Armor/(Armor + 40·aLvl)` (cap 85%, §2 / `physDR` in engine.js & combat.py).
   **Consequence:** raising Armor mitigates physical *damage*; it does **not** make
   you harder to hit. That's Evasion's job. Build accordingly.

2. **Armor reduces physical damage.** Pure 1.14d armor never reduces damage — only
   avoidance. Deepgilt's `armor/(armor+40·lvl)` curve is a D&D-flavored addition
   (DESIGN.md §9 header: "D2 % core + D&D concepts").

---

## Cross-references
- [DESIGN.md §2] — derived-stat formulas (Accuracy, Evasion, Armor, physDR caps)
- [DESIGN.md §9] — combat math, block, crit, saving throws
- [`client/engine.js`](client/engine.js) — `hitChance`, `physDR`, `armorDefense`, `itemDefense`, `resolveAttack`
- [`client/dg/core/hero.js`](client/dg/core/hero.js:40) — sums `itemDefense` into `derived.armor`
- [`client/index.html`](client/index.html:724) — `baseDef()` → tooltip "Defense: N"
- [`engine/combat.py`](engine/combat.py) — Python server-authoritative `hit_chance` / `phys_dr` / `resolve`
- [`engine/items.py`](engine/items.py) — Python `armor_defense` / `item_defense` (mirror of the client functions)
- [`engine/character.py`](engine/character.py:21) — `Character.derived()` overrides `armor` with `Σ item_defense` (mirror of hero.js)
- **Remaining wiring:** `server/server.py` must build players via `Character` before it equips server-side armor (see the server-wiring note up top).
