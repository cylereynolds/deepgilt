# Deepgilt *(working title — not cleared, see DESIGN §1)*

A botting-first ARPG descended from **Diablo 2** and **Dungeons & Dragons**, skinned entirely in original lore.

> A god was murdered. Its corpse — *gilt* — is the only power and the only money left in the world. In the lawless scramble over the remains, the strong don't fight alone: they bind the dead to serve them.

## The fusion

- **Diablo 2** — the ARPG skeleton: loot, levels, skill trees, isometric click-combat, deep itemization, the runeword/affix economy.
- **D&D** — the character chassis: attributes, derived stats, damage types, saving throws, class archetypes, monster design.
- **Screeps** — sanctioned, first-class botting: you *bind* servants and hand them a **geas** (a behavior script) that runs without you.

These three were always one machine in practice (people botted D2 to farm items they sold on d2jsp). Deepgilt makes that machine legal, native, and unified.

## Legal stance (load-bearing)

We take only what is **unprotectable** — mechanics, systems, genre, math. Every name, character, place, item, and story beat is **original**. Nothing here belongs to Blizzard or Wizards of the Coast. The line we hold is in `DESIGN.md` §1; the migration map is the "swap sheet."

## Tone

Pulpy heroic-dark — Diablo 2's own register. Gothic but propulsive; dark but *fun*, not depressing.

## Business model *(decided — see project memory + DESIGN §12)*

- **Mobile:** free, no botting, walled bot-free economy, gold via App Store IAP only.
- **PC:** paid (the entry fee is a bot tax), botting + PvP, P2P trade, a d2jsp-style gold market — the company *sells* gold but never buys it back for cash (the legal keystone).
- Two **walled** economies, one brand. Gold and items never cross the wall.

## Files

- `DESIGN.md` — the systems bible (start here).
- `data/classes.json` — the six Gilded classes as structured data.
- `data/geas_instructions.json` — the geas instruction set (the botting layer as content).

**Status:** design v0. No engine yet. Numbers are first-pass and unbalanced.
