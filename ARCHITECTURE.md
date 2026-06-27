# Deepgilt — Engine Architecture

**Guide:** [OpenDiablo2](https://github.com/OpenDiablo2/OpenDiablo2) (GPL-3.0, Go). We use its
*architecture* as our blueprint and reimplement every concept **clean-room** — no OD2 code is
copied, no Diablo II / OD2 data or assets are embedded. OD2 is the reference for *how a D2-class
engine is organized*; all expression here is our own. (See the clean-room rules below.)

Our stack is **not** OD2's, so we adopt the *shapes*, not the code:

| OD2 | Deepgilt |
|---|---|
| Go + Ebiten | Browser **JS + Canvas2D** client; **Python** authoritative sim (`engine/`, `server/`) |
| MPQ/DC6/DCC/DS1/DT1/COF/PAL loaders | **Skip** — our assets are AI-generated PNG sprite sheets + JSON; loaded over HTTP |
| `.txt`/`.bin` data tables (Blizzard's) | **Our own** `data/*.json` |
| otto/goja script VM | **Our geas system** |
| Go goroutines / `d2thread` | JS event loop + async; Python threads server-side |

---

## Layering (one-way dependencies — the core idea we're adopting)

```
app        bootstrap / wiring                     (depends on everything)
 │
game       screens, player control, panels        (depends on core + common)
 │
core       ENGINE SERVICES (see table)            (depends on common only)
 │
common     types, enums, math, record schemas     (depends on nothing)
```

Nothing in `common` knows about `core`; nothing in `core` knows about `game`. Implementations sit
behind **interfaces** (OD2's `d2interface`) so a backend is swappable — e.g. our Canvas2D renderer
could be replaced by a WebGL one without touching game logic.

---

## Subsystem map: OD2 → Deepgilt

### common  (`client/dg/common/`, pure, no engine deps)
| OD2 | Deepgilt module | Status |
|---|---|---|
| `d2enum` | `enums.js` — damage types, rarities, anim **modes** (neutral/walk/run/attack/cast/hit/death), 8 directions | partial (scattered consts today) |
| `d2math`, `d2vector` | `math.js` — vector + the **iso projection** (`w2i/i2w/isoC`) | ✅ exists inline in index.html → extract |
| `d2geom` | `geom.js` — rects, grid helpers | inline today |
| `d2records` schema | record *shapes* for Monster/Item/Skill/Affix/Level | ✅ JSON in `data/` |
| `d2loader` (sources: fs, mpq) | `source.js` — an **HTTP/fetch source** (our only source) | ad-hoc `new Image()` today |
| `d2cache` | `cache.js` — generic LRU for assets | none yet |
| `d2calculation` (lexer/parser) | optional: tiny expression evaluator so skill/affix **formulas live in JSON** not code | future, high-leverage |

### core  (`client/dg/core/`, engine services)
| OD2 | Deepgilt module | Status |
|---|---|---|
| `d2asset` + `d2loader` | **AssetManager** — load+cache sprites/tiles/audio via the HTTP source; returns `Animation`/`Texture` | replaces scattered loads (SHEETS, floorTex…) |
| `d2render` (+ ebiten) | **Renderer** interface + **Canvas2D backend** (our iso renderer) | ✅ exists inline → extract behind interface |
| `d2cof` + `d2animdata` + asset anim | **Animation** — `mode × direction × frame` w/ timing, plus **layered composition** (body/armor/weapon) | walk-only today; the blueprint for our animation gap + gear-on-sprite |
| `d2map/d2mapengine` | **MapEngine** — tile grid model + walkability (incl. **subtile** flags, per DT1 idea) | inline; one-flag-per-cell today |
| `d2map/d2maprenderer` | **MapRenderer** — iso draw of floor/walls/entities, depth sort | ✅ exists inline → extract |
| `d2map/d2mapentity` | **MapEntity** base — pos + animation + update/render; hero/husk/servant/drop/missile all derive | ad-hoc objects today |
| `d2map/d2mapgen` | **MapGen** — procedural rooms+corridors | ✅ `genMap()` inline |
| `d2map/d2mapstamp` | **MapStamp** — prefab room pieces (boss room, vault, shrine) stamped into the layout | none — serves "dungeon richness" |
| `d2records` | **RecordManager** — load `data/*.json` → typed records | ✅ engine reads JSON → formalize |
| `d2stats` | **Stats** — attribute/derived layer | ✅ `DG.derived`/attrs → formalize |
| `d2item` / `d2inventory` | **Item / Inventory** | ✅ `rollItem`/EQUIP/INV → formalize |
| `d2hero` | **Hero** entity (a MapEntity) | ✅ `P`/`HEROD` → formalize |
| `d2path` | **Pathing** — A* over the walkable grid | none (husks slide & can stall) |
| `d2input` | **Input** — pointer/key manager | inline listeners |
| `d2audio` | **Audio** — provider (deferred to last, per project) | none |
| `d2screen` | **SceneManager** — stack of scenes w/ load/unload/update/render | separate HTML pages today |
| `d2ui` / `d2gui` | **UI** — keep DOM widgets (web gives us this); adopt a UI-manager concept only | DOM today (fine) |
| `d2term` | **Console** — debug command line (dev-experience win) | none |

### game  (`client/dg/game/`)
| OD2 | Deepgilt | Status |
|---|---|---|
| `d2gamescreen` | Scenes: MainMenu, **CharSelect** (`classes.html`), InGame (`index.html`), GeasEditor | separate pages → unify under SceneManager |
| `d2player` | Player controller + HUD panels (orbs, skill bar, inventory) | ✅ inline in index.html |

### networking  (`server/` — already aligned)
| OD2 | Deepgilt | Status |
|---|---|---|
| `d2server` | `server/server.py` — authoritative tick server | ✅ |
| `d2client` (local vs remote) | unify: game always talks to a **server**, *local in-process* (SP) or *remote* (MP) — same client code | partial (play-online.html) |
| `d2netpacket` | packet/intent types | ✅ join/input/state |

### script
| `d2script` | **geas** system (bind + instruction set) | ✅ the botting layer |

---

## What does NOT transfer (don't blindly copy OD2 here)
- **Asset-format loaders** (MPQ/DC6/DCC/DS1/DT1/COF/PAL): all about Blizzard's proprietary files we don't use. We keep PNG + JSON.
- **`d2thread`**: Go's mainthread juggling — irrelevant to the JS event loop.
- **Heavy UI toolkit** (`d2ui`/`d2gui`): the browser DOM already gives us buttons/panels/scroll for free; we only borrow the *manager* concept.
- **Don't big-bang rewrite** the working prototype. Migrate incrementally (below); keep it playable at every step.

---

## Migration path (incremental — prototype stays playable)
1. **Extract the foundation** from `index.html` into `client/dg/` modules: `math/iso`, `MapEngine`, `MapRenderer`, `MapEntity`. index.html becomes thin glue. *(Foundational; everything else builds on a clean map/entity split.)*
2. **AssetManager + Animation** (`mode × dir × frame`, layered) → unlocks attack/cast/hit/death anims **and** equipment-on-sprite from one system.
3. **RecordManager + Stats/Item/Inventory/Hero** as formal modules over today's JSON + `DG.*`.
4. **Pathing (A*)**, **Lighting** (light radius/blob shadows), **MapStamp** prefab rooms.
5. **SceneManager** unifying the pages; **local/remote client** unification; audio last.

---

## Clean-room rules (binding)
1. **Never transcribe OD2 code.** Read its architecture to understand a *concept*, then implement from understanding in our own idiom. Mechanics/math/architecture/file-format facts aren't copyrightable; code expression is.
2. **Never embed D2 or OD2 data/assets.** Original AI-gen art + our own JSON only.
3. **Keep Deepgilt's IP original** (names, lore, classes, assets).

> Honest scope note: this is *independent reimplementation guided by a reference*, not strict legal
> clean-room (which needs a separate person writing a spec the implementer never crosses with the
> source). The protections that actually hold: no copied code → no GPL obligation; no D2 assets/data
> → no asset infringement; game mechanics aren't copyrightable → a D2-like is legal.
