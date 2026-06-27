# Deepgilt — client (playable demo)

A browser slice of the game, **driven by the real engine**: `engine.js` is a faithful JS
port of the Python `engine/` (same formulas), and it reads the same `../data/*.json` files.
The hero's stats, the monsters, combat rolls, and loot all come from the actual game data —
not hardcoded numbers.

## Run it

Browsers block `file://` fetches, so serve the **project root** and open `/client/`:

```bash
cd ~/Desktop/deepgilt
python3 -m http.server 8000
# then open http://localhost:8000/client/
```

## What's wired to the engine

| In the demo | Comes from |
|---|---|
| hero life / accuracy / crit / bind capacity | `DG.derived()` ← `engine/stats.py` |
| every husk's hp / damage / armor / resist | `data/monsters.json` + `DG.scaleMon()` / `DG.champion()` |
| each swing's hit / crit / mitigation | `DG.resolveAttack()` ← `engine/combat.py` |
| the loot that drops ("found …") | `DG.rollItem()` ← `engine/items.py` + `data/affixes.json` |

So the canonical Bonewright here computes **life 273, bind capacity 6, geas length 10** —
identical to `python3 -m engine`.

## Controls

- **click** — move
- you **auto-attack** the nearest foe
- **E** — bind a servant (costs 15 gilt); it fights for you
- **Q** — quaff a gilt-draught (heal)
- clear the floor, step into the **rift** to descend

## Status

Sprites are original hand-authored pixel art (license-clean placeholders); drop in any
free sprite pack the same way. This is the seed of the real client — next up: per-class
sprites, the geas-editor UI, and server-authority.
