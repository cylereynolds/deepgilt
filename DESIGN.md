# Deepgilt — Systems Bible v0

Everything mechanical here is lifted from Diablo 2 and D&D (both unprotectable as *systems*) and reskinned in original lore. Numbers are first-pass placeholders for balancing later.

---

## §0. Premise (story recap)

The maker-god **the Wright** is not dead — it is *dying*, slowly, its heart still beating deep in the world's death-wound, the **Hollow**. Its congealed divine blood, **gilt**, is loot, magic, currency, and the source of all monsters at once. The rare mortals who can hold raw gilt and stay themselves are the **Gilded** (the player). Gilt animates the dead and the inert, so the Gilded **bind** servants to a **geas** (a standing command). There is no law; the world is a scramble over the remains. You descend the Hollow to get gilt, grow, bind more, and go deeper — toward the heart, and the thing that killed the Wright: the **First Bound**.

---

## §1. Legal stance (the line we hold)

| We take freely (unprotectable) | We invent (originals replace) |
|---|---|
| ARPG genre, core loop, isometric click-combat | game name/brand → *Deepgilt* (clear before lock) |
| loot/level/skill-tree systems, affix & socket mechanics | named characters → the Wright, the First Bound, the blind appraiser |
| stat/damage/resist/save math (D2 % + D&D concepts) | places → the Hollow, Lasthold, Goldgrave |
| class archetypes, monster-design patterns | "runewords" → **geas-words**; rune names → **sigils** |
| the *idea* of attributes, AC, saving throws | all art, music, UI, animation (build original) |

Rule of thumb: copy the **verb**, never the **noun**. A spinning melee attack is fine; calling it Whirlwind and giving it Barbarian flavor is theirs. Reskin every noun.

---

## §2. Attributes & derived stats

Five attributes — a fusion of D2's four (Str/Dex/Vit/Energy) and D&D's six:

| Attribute | ~Maps to | Governs |
|---|---|---|
| **Might** | STR | melee damage, heavy-gear requirements |
| **Finesse** | DEX | accuracy, ranged/finesse damage, crit, evasion, block |
| **Vigor** | CON + Vit | life, stamina, physical saves |
| **Wit** | INT + Energy | gilt-power (spell) damage, charge pool, mental saves |
| **Wyrd** | WIS/CHA (original twist) | **bind capacity, geas length**, gilt-power potency, gilt-sight (magic find), curse saves |

**Wyrd is the original keystone:** it governs the binding/automation system. A "summoner/botter" build is a high-Wyrd build. This is the stat that has no clean D2/D&D equivalent and makes the game ours.

### Derived stats (first-pass formulas)

```
Life        = classBase + Vigor*4 + level*2
Charge      = classBase + Wit*2  + level*1        (the resource; "gilt-charge")
Stamina     = 60 + Vigor*3
Accuracy    = Finesse*1.5 + level + weaponSkill
Evasion     = Finesse*1.0 + level*0.5
Armor       = Σ gear; physical DR = Armor / (Armor + 40*attackerLevel)   (cap 85%)
Crit chance = 5% + Finesse*0.10% + gear
Crit mult   = 2.0x + gear
Block       = shieldBlock% + Finesse*0.05%        (cap 75%)
Resist (each type) = Σ gear   (cap 75%, overcap counts vs penetration)
Bind capacity = 1 + floor(Wyrd/12) + skills
Geas length   = 3 + floor(Wyrd/8)  + skills        (PC custom; mobile uses presets)
Gilt-sight (MF) = Wyrd*0.5% + gear
```

Gear has **Might/Finesse requirements** to equip (D2's str/dex reqs), gating heavy armor and big weapons behind the right build.

---

## §3. Damage types & resistances

Physical plus five gilt-aspects (reskinned elements). Each has a resistance, cap 75%.

| Type | ~D2 | Flavor |
|---|---|---|
| **Steel** | physical | mundane weapon/impact |
| **Ember** | fire | gilt burning hot |
| **Rime** | cold | gilt gone cold; also *chill* (slow) and *freeze* (CC) |
| **Galv** | lightning | gilt arcing; high variance |
| **Rot** | poison | gilt souring; damage-over-time |
| **Wither** | magic | the unmaking; the Wright's death itself — ignores most armor |

Wither (our "magic damage") is rare, build-around, and partially armor-piercing — the prestige damage type, gated behind high Wyrd/Wit.

---

## §4. Leveling & progression

- **XP curve:** exponential, D2-style. Soft cap at **level 60** (clears the 5-act story).
- **Per level:** +3 attribute points, +1 skill point (D2 cadence).
- **Respec:** consumable *draught of unbinding* (bought or rare drop) — refunds points. Not free, not infinite.
- **Endgame — Gilt-Ascension (our paragon):** past 60, XP buys infinite **Ascension** levels, each granting a tiny pick from a stat/affinity board. This is the bottomless grind the botting endgame feeds on — bind a farm, ascend forever.
- **Difficulty tiers:** the descent re-opens at higher **Depths** (our Normal/Nightmare/Hell) with scaled monsters, better gilt, and a resistance *penalty* per tier (−40% / −100%) so resist gear stays relevant (pure D2).

---

## §5. Classes — the six Gilded

Every class can perform a **lesser bind** (one weak servant); the **Bonewright** is built around binding. Each class has **3 skill trees**; sample signature skills listed (full lists stubbed in `data/classes.json`). Archetype maps shown for provenance — none of the names are theirs.

### 1. The Reaver — *Barbarian / Fighter* · Might
Frontline brute; gilt-fueled rage. Trees:
- **Onslaught** — melee actives (e.g., *Cleave* cone, *Bloodmill* spin-attack, *Sunder* armor-break).
- **Warcries** — shouts that buff allies/servants & debuff foes (*Roar*, *Ironhide*, *Bloodscent*).
- **Bloodgilt** — spend life/gilt for burst; berserk states.

### 2. The Pyre — *Sorceress / Wizard* · Wit
Ranged gilt-caster; the elemental class. Trees mirror the aspects:
- **Ember** (*Cinderbolt*, *Pyre Nova*, *Conflagrate*).
- **Rime** (*Frostlance*, *Rimefield* slow, *Shatter* freeze-detonate).
- **Galv** (*Arcjump* chain, *Stormcall*, *Overcharge*).

### 3. The Bonewright — *Necromancer / Warlock* · Wyrd **(the botting flagship)**
Binds the dead, curses the living, wields death-gilt. Trees:
- **Bonecraft** — summon & buff servants (*Raise Husk*, *Gilt Golem*, *Bind Mastery*: +capacity/+geas length).
- **Hexes** — curses/debuffs (*Wither* curse, *Sap*, *Doom*).
- **Sepulture** — direct death magic (*Bone Spire*, *Corpse Burst*, *Reap*).
> This class makes the most servants with the longest geas. On PC it is the "write a farming botnet" class.

### 4. The Warden — *Paladin / Cleric* · Might/Wyrd
Channels the **Last Law** (no gods — just remembered order). Auras + melee + support. Trees:
- **Oaths** — toggled auras (*Aura of the Lawful*: party resist; *Wrathlight*: party damage; *Bulwark*: party armor).
- **Judgment** — holy-flavored melee (*Smite-equivalent: Verdict*, *Sear*, *Censure*).
- **Wards** — heal/shield self, party, and servants (*Mend*, *Aegis*, *Sanctuary-equivalent: Hold*).

### 5. The Stalker — *Amazon / Ranger / Rogue* · Finesse
Ranged physical + traps + venom. Trees:
- **Marksmanship** — bow/thrown (*Pierce Shot*, *Volley*, *Gilt Arrow*).
- **Snares** — laid traps (*Spiketrap*, *Galv Mine*, *Net*).
- **Venom** — Rot DoT + evasion (*Coated Blade*, *Plague Cloud*, *Vanish*).

### 6. The Feral — *Druid / shapeshift Barbarian* · Vigor/Wyrd
Half-corrupted; shifts into gilt-beasts and binds wild husks. Trees:
- **Shift** — werebeast forms (*Maul-form*, *Stalk-form*, form-passives).
- **Packbind** — summon gilt-beasts (a second binder flavor: *Call Pack*, *Alpha Bond*).
- **Blight** — gilt-elemental/storm magic (*Spore*, *Galv Storm*, *Quake*).

---

## §6. Skills framework (D2 model)

- Skills cost **skill points**; each rank improves it (damage/duration/scaling).
- **Synergies:** ranks in related skills passively boost a skill (D2's defining depth — rewards specialization).
- **Prerequisites:** tree tiers unlock by total points spent in that tree + character-level gates.
- **Resource:** active skills cost **charge** (mana); a few ultimate skills also have cooldowns.
- **Stances/Oaths/Geas-stances:** some skills are toggles (auras, forms) that drain or reserve charge.
- Mobile and PC share the same skill system; only the **geas editor** (§7) differs by platform.

---

## §7. The Bind & Geas system — the botting layer

This is the original heart of the game and the Screeps pillar, expressed as content in `data/geas_instructions.json`.

### Binding
- **Bind** converts a corpse, husk, construct, or beast into a **servant**. Universal *lesser bind* = 1 weak servant; the Bonewright/Feral get real binding kits.
- Servant statline scales from your **Wyrd** + the source monster's tier.
- **Bind capacity** caps active servants (see §2). Exceed it and the oldest crumbles.

### Geas (the program)
A **geas** is an ordered list of instructions a servant runs every tick — a tiny behavior program. **Geas length** (instruction count + conditional depth) scales with Wyrd and Bonecraft skills.

- **Mobile = preset geas only.** Pick one of a few canned behaviors (Aggressive / Guard / Gather / Follow). This is just merc-style minion AI — *no custom automation*, which keeps mobile bot-free by design.
- **PC = full geas editor.** Compose instructions with conditionals and loops (`IF hp<30% RETREAT`, `HUNT nearest`, `GRAB gilt`, `DESCEND when floor clear`), save them as **geas-scrolls**, and share/sell them. This *is* the botting — a real, sanctioned scripting layer. See the instruction set in data.

### Why it unifies the design
The same discipline, **geas-craft**, also binds powers into items (**geas-words**, §8). One magic system explains your minions *and* your crafting — tighter than D2 ever was. High-Wyrd "binder" players are the PC economy's farmers; their geas-scrolls become tradeable goods in their own right.

---

## §8. Itemization (the economy's foundation)

Deep, high-variance, tradeable loot is the soil the whole gold economy grows in. Ported wholesale from D2 + D&D magic items.

### Slots
helm, body, weapon, offhand (shield/focus), gloves, boots, belt, amulet, 2× ring, + **reliquary** slot. Plus **gilt-charms** (inventory passives, D2-style).

### Rarity tiers
| Tier | ~D2/D&D | Affixes |
|---|---|---|
| **Cracked** | normal/common | none (white) |
| **Gilded** | magic/uncommon | 1–2 affixes (blue) |
| **Wrought** | rare | 3–6 affixes (yellow) |
| **Covenant** | set | set bonuses across pieces (green) |
| **Relic** | unique/legendary | fixed, named, build-defining (gold) |
| **Godblood** | artifact/mythic | endgame, partially mutable, ultra-rare |

### Affixes
Prefix + suffix pools, each affix in **tiers** gated by **item level** (D2 ilvl system): +Might, +Life, +%damage, +resist, +crit, +skills, +bind capacity, +gilt-sight, etc. (Affix table stubbed for v0.)

### Sockets, sigils & geas-words
- Items roll **sockets**; you slot **sigils** (our runes — `Au, Mor, Sol, Var, Eth, Nyx, Gol, Ruin, Ix, Ven, Cor, Wyr`).
- An ordered sigil recipe in the right base forms a named **geas-word** (our runeword). Examples:
  - **Tithe** = `Au · Mor` (2-socket weapon) → life-leech + gilt-find.
  - **Lastlight** = `Sol · Var · Eth` (3-socket armor) → all-resist + light radius + cannot be frozen.
  - **Hollowmaw** = `Nyx · Nyx · Gol · Ruin` (4-socket weapon) → heavy Steel+Wither + *chance to bind a slain foe as a servant* (theme payoff).
- Sigils are **gilt-sinks** (crafting consumes them) and trade goods — exactly D2's rune economy.

### Economy rules
Everything is **tradeable** (trading is the point). Only a few story-relic quest items are bind-on-pickup. Drops scale with monster level + gilt-sight.

---

## §9. Combat math (D2 % core + D&D concepts)

```
Hit chance   = clamp( 100 * Acc/(Acc+Eva) * 2*aLvl/(aLvl+dLvl), 5%, 95% )
Steel dmg    = roll(wpnMin..wpnMax) * (1 + Σphys%/100) + flat
   mitigated = dmg * (1 - physDR)
Aspect dmg   = base * (1 + Σaspect%/100);  mitigated = dmg * (1 - resist%)
Crit         = if rand < critChance: dmg *= critMult
Block        = if shield & rand < block%: negate (Finesse-timed)
```

**Saving throws (D&D flavor, ARPG-real-time):** crowd-control (stun/freeze/curse/fear) lands only if `d100 > Save`, where `Save = base + attrMod` — **Vigor** vs physical CC, **Wit** vs mental, **Wyrd** vs curses. Bosses have high saves + CC-duration caps (D2's diminishing returns). This fuses D&D's save concept onto D2's CC system.

→ Full resolution order, the 1.14d to-hit derivation, and the per-piece **Armor value build** formula (base ×1.5 Spectral × ED% + flat): see [COMBAT_RESOLUTION.md](COMBAT_RESOLUTION.md).

---

## §10. Bestiary

- **Families:** Husks (reanimated dead), Beasts (corrupted wildlife), Constructs (old gilt-machines), the Drowned (flooded-vault things), Cultists (Beating-Heart faithful), and the **Warped** (elites/bosses).
- **Champion/Rare packs** roll **monster affixes** (reskinned D2 mods): *Fleet* (extra-fast), *Wretched* (curses you), *Ember-touched* (fire-enchanted), *Manybound* (summons husks), *Leeching*, *Giltskin* (stoneskin), *Galv-charged* (lightning-enchanted). Rare = multiple affixes + better loot.
- **Bosses:** one per act (§11), culminating in the **First Bound**.

---

## §11. The Descent — five acts (follows the story)

Maps D2's 5-act structure onto the dive toward the heart. Each act = a depth band with a hub (safe-hold), a dominant faction, a bestiary theme, and an act boss.

- **Act I — Lasthold & the Lip.** Frontier mining town at the Hollow's rim; the picked-over upper depths. Faction: **the Last Law** (the failing order, your tutorial allies). Boss: **the Overseer** — a Warped foreman who hoards the lip's gilt.
- **Act II — The Drowned Vaults.** Old flooded gilt-mines below. Faction: scavenger freeholders. Bestiary: the Drowned, constructs. Boss: **the Sump-Mother**.
- **Act III — The Reliquary's Reach.** A gilt-priest stronghold where the **Reliquary** (the market faction) rules — and where the in-world economy hub lives. Boss: **the Coinflayer**, a priest gone gold-mad.
- **Act IV — The Pilgrim Road.** The **Beating-Heart cult's** descent toward the heart; zealots and the worst-warped. Boss: **the Choirmaster of the Beat**.
- **Act V — The Heart-Chamber.** The dying god's heart, still beating. Confront **the First Bound** — the Wright's first creation, who slew the maker to take its power. Endgame opens here (Gilt-Ascension, the deep farm).

---

## §12. Economy hooks (see project memory for the full model)

- **Gold = gilt** (lore-native: the currency *is* the loot *is* the god's blood).
- **Market house** run diegetically by the Reliquary (Act III hub + menu everywhere).
- **The d2jsp model:** company sells gilt (mobile IAP / PC launcher), **never buys it back for cash**; P2P real-money trade stays tolerated-but-against-the-rules on paper. Two **walled** economies (mobile bot-free / PC botted) that never share gold or items.
- **Gilt-sinks (anti-inflation):** market fees, gear repair, geas-word crafting (consumes sigils), and **the Wheel** — a gilt-gambling NPC (D2's gamble vendor + d2jsp's casino, reskinned).
- **PvP:** human-only, no API surface for combat; honor rooms with server-enforced rules (no pots/town/chicken) but griefing left possible; matchup/level brackets. (Full spec in memory.)

---

## §13. Roadmap — what's v0 vs. stubbed

**Done (frameworks + samples):** attributes, derived-stat formulas, damage/resist, leveling + ascension, six classes & trees, skill model, the bind/geas system + instruction set, itemization + rarities + geas-words, combat math + saves, bestiary framework, the five-act descent, economy hooks.

**Stubbed (next passes):** full per-class skill lists & numbers; the complete affix table; full sigil/geas-word catalog; balance values; the geas-editor UX; boss mechanics; netcode & server-authority; art/audio/UI production.

**Suggested next:** (a) flesh one class end-to-end as a vertical reference, (b) write the full affix + geas-word tables (the economy depends on them), or (c) start the actual code skeleton (entity/stat/skill data model from `data/`).
