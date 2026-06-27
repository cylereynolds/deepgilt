// Deepgilt — core/MapEngine : the map *model* (tile grid + walkability + procedural gen).
// No rendering here (that's MapRenderer). Cells: 0 = floor, 1 = wall. World px = grid * TS.
// Clean-room; OD2's d2mapengine/d2mapgen are reference only.
(function () {
  function rr(rng, a, b) { return a + rng() * (b - a); }

  function MapEngine(GW, GH, TS, rng) {
    this.GW = GW; this.GH = GH; this.TS = TS; this.rng = rng;
    this.cells = null; this.rooms = []; this.portalCell = null;
  }
  var P = MapEngine.prototype;

  P.carveH = function (c, x0, x1, y) { var s = Math.min(x0, x1), e = Math.max(x0, x1); for (var x = s; x <= e; x++) { c[y][x] = 0; if (y + 1 < this.GH) c[y + 1][x] = 0; } };
  P.carveV = function (c, y0, y1, x) { var s = Math.min(y0, y1), e = Math.max(y0, y1); for (var y = s; y <= e; y++) { c[y][x] = 0; if (x + 1 < this.GW) c[y][x + 1] = 0; } };

  P.generate = function () {
    var GW = this.GW, GH = this.GH, rng = this.rng, c = [], x, y;
    for (y = 0; y < GH; y++) { c[y] = []; for (x = 0; x < GW; x++) c[y][x] = 1; }
    var rooms = [];
    for (var t = 0; t < 80 && rooms.length < 12; t++) {
      var rw = 4 + Math.floor(rr(rng, 0, 6)), rh = 3 + Math.floor(rr(rng, 0, 5));
      var rx = 1 + Math.floor(rr(rng, 0, GW - rw - 2)), ry = 1 + Math.floor(rr(rng, 0, GH - rh - 2)), bad = false;
      for (var k = 0; k < rooms.length; k++) { var R = rooms[k]; if (rx < R.x + R.w + 1 && rx + rw + 1 > R.x && ry < R.y + R.h + 1 && ry + rh + 1 > R.y) { bad = true; break; } }
      if (bad) continue;
      for (y = ry; y < ry + rh; y++) for (x = rx; x < rx + rw; x++) c[y][x] = 0;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
    }
    if (!rooms.length) { for (y = 4; y < GH - 4; y++) for (x = 4; x < GW - 4; x++) c[y][x] = 0; rooms.push({ x: 4, y: 4, w: GW - 8, h: GH - 8, cx: GW >> 1, cy: GH >> 1 }); }
    for (var i = 1; i < rooms.length; i++) {
      var a = rooms[i - 1], b = rooms[i];
      if (rng() < 0.5) { this.carveH(c, a.cx, b.cx, a.cy); this.carveV(c, a.cy, b.cy, b.cx); }
      else { this.carveV(c, a.cy, b.cy, a.cx); this.carveH(c, a.cx, b.cx, b.cy); }
    }
    this.cells = c; this.rooms = rooms;
    // entrance = room 0; exit = the room farthest from it, turned into a stamped vault chamber
    var r0 = rooms[0], exit = r0, bd = -1;
    for (var e = 0; e < rooms.length; e++) { var rm = rooms[e], dd = (rm.cx - r0.cx) * (rm.cx - r0.cx) + (rm.cy - r0.cy) * (rm.cy - r0.cy); if (dd > bd) { bd = dd; exit = rm; } }
    this.exitRoom = exit; this.specials = []; this.stampVault(exit);
    return this;
  };

  // MapStamp (= OD2 d2mapstamp idea): overlay a prefab "vault" onto a room — isolated pillars
  // (never disconnect, you walk around them) + recorded special spawns (guardian + treasure).
  P.stampVault = function (rm) {
    if (rm.w < 4 || rm.h < 4) return;
    var cx = rm.cx, cy = rm.cy;
    for (var y = rm.y + 1; y < rm.y + rm.h - 1; y += 2)
      for (var x = rm.x + 1; x < rm.x + rm.w - 1; x += 2)
        if (!(x === cx && y === cy) && !(Math.abs(x - cx) + Math.abs(y - cy) === 1)) this.cells[y][x] = 1; // pillar
    this.specials.push({ type: 'guardian', x: cx + 0.5, y: cy + 0.5 });
    this.specials.push({ type: 'treasure', x: rm.x + 1.5, y: rm.y + 1.5 });
    this.specials.push({ type: 'treasure', x: rm.x + rm.w - 1.5, y: rm.y + rm.h - 1.5 });
  };

  // TOWN layout (not a dungeon): one large open plaza enclosed by a perimeter wall, with discrete
  // building blocks (shops/houses) set back around the edges. Central plaza stays clear + fully connected.
  P.generateTown = function () {
    var GW = this.GW, GH = this.GH, c = [], x, y;
    for (y = 0; y < GH; y++) { c[y] = []; for (x = 0; x < GW; x++) c[y][x] = 1; }
    // plaza fills the grid (3-tile wall margin) so it scales with the town size; shops distributed around the edges
    var PW = GW - 6, PH = GH - 6, ax = 3, ay = 3;
    var px0 = ax + 1, py0 = ay + 1, px1 = ax + PW - 2, py1 = ay + PH - 2;   // open plaza inside a wall ring
    for (y = py0; y <= py1; y++) for (x = px0; x <= px1; x++) c[y][x] = 0;
    var blds = [], bxr;
    for (bxr = 4; bxr <= PW - 9; bxr += 9) { blds.push([bxr, 3, 5, 3]); blds.push([bxr, PH - 6, 5, 3]); }  // shop rows top + bottom
    blds.push([4, (PH >> 1) - 3, 3, 6]); blds.push([PW - 7, (PH >> 1) - 3, 3, 6]);                          // a house on each side
    for (var i = 0; i < blds.length; i++) { var b = blds[i], bx = ax + b[0], by = ay + b[1]; for (y = by; y < by + b[3]; y++) for (x = bx; x < bx + b[2]; x++) if (x >= 0 && y >= 0 && x < GW && y < GH) c[y][x] = 1; }
    this.cells = c;
    this.rooms = [{ x: px0, y: py0, w: px1 - px0, h: py1 - py0, cx: ax + (PW >> 1), cy: ay + (PH >> 1) }];
    this.exitRoom = this.rooms[0]; this.specials = []; this.portalCell = null;
    return this;
  };

  // THE GILDED HOLD — the 56x40 survivor-encampment blueprint. All-walkable mud; a sharpened-log
  // palisade (wall cells) on the left/top/right with the gate open at the top-right. Structure
  // footprints + the river get blocked via solid[] (collision with no wall cube). Per-zone floor
  // textures are chosen by the renderer's texFn; structure visuals live in index.html.
  P.generateEncampment = function () {
    var GW = this.GW, GH = this.GH, c = [], x, y;
    for (y = 0; y < GH; y++) { c[y] = []; for (x = 0; x < GW; x++) c[y][x] = 0; }
    for (y = 0; y <= 25 && y < GH; y++) c[y][10] = 1;                 // left palisade  X10, Y0-25
    for (x = 10; x <= 45 && x < GW; x++) c[0][x] = 1;                 // top palisade   Y0,  X10-45
    for (y = 10; y < GH; y++) c[y][GW - 1] = 1;                       // right palisade X56, Y10-40 (gate = open top-right)
    this.cells = c; this.solid = [];
    this.rooms = [{ x: 11, y: 1, w: GW - 12, h: GH - 2, cx: 33, cy: 24 }];   // spawn on open mud right-of-centre
    this.exitRoom = this.rooms[0]; this.specials = []; this.portalCell = null;
    return this;
  };

  // CHUNK-AND-SOCKET layout (ChunkGen): build a D2-style prefab map for a zone, then bake it into
  // this engine's exact contract (cells 0/1, rooms[0]=entrance, exitRoom, specials guardian/treasure).
  // opts.kind = 'dungeon' (maze) | 'wilderness' (open field). Falls back to generate() if ChunkGen absent.
  P.generateChunk = function (opts) {
    opts = opts || {};
    var CG = (window.DGC || {}).ChunkGen;
    if (!CG) return this.generate();
    var rng = this.rng;
    // Biome chunk size: wilderness = large open 7×7 chunks (easy to get swarmed); dungeon = tight 5×5 (more chokepoints).
    var CS = opts.CS || (opts.kind === 'wilderness' ? 7 : 5);
    // FILL the engine grid — its gw×gh IS this zone's authored size (set per-zone in spawn from the ACT1 table).
    var mw = opts.mw || Math.max(3, Math.floor(this.GW / CS));
    var mh = opts.mh || Math.max(3, Math.floor(this.GH / CS));
    var seed = (opts.seed != null) ? opts.seed : (rng() * 0x7fffffff) | 0;
    var layout = opts.layout || ['left', 'right', 'straight'][(rng() * 3) | 0];
    var g = new CG.MapGenerator({ GW: mw, GH: mh, seed: seed, layout: layout });
    if (opts.kind === 'wilderness') g.genWilderness(); else g.genDungeon();
    var R = g.rasterize(CS);                                          // R.GW×R.GH tiles + rooms/specials/entrance/exit
    if (!R.rooms.length) return this.generate();                     // degenerate → safe fallback

    // center the rasterized block inside this.GW×this.GH and stamp it onto a fresh wall grid
    var ox = Math.max(0, (this.GW - R.GW) >> 1), oy = Math.max(0, (this.GH - R.GH) >> 1), x, y;
    var c = []; for (y = 0; y < this.GH; y++) { c[y] = []; for (x = 0; x < this.GW; x++) c[y][x] = 1; }
    for (y = 0; y < R.GH; y++) for (x = 0; x < R.GW; x++) if (oy + y < this.GH && ox + x < this.GW) c[oy + y][ox + x] = R.cells[y][x];
    this.cells = c;

    // translate rooms/specials/entrance/exit into engine cell space
    var rooms = R.rooms.map(function (r) { return { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h, cx: r.cx + ox, cy: r.cy + oy }; });
    var ent = { x: R.entrance.x + ox, y: R.entrance.y + oy }, exi = { x: R.exit.x + ox, y: R.exit.y + oy };
    function nearestRoom(px, py) { var b = rooms[0], bd = 1e9; for (var i = 0; i < rooms.length; i++) { var d = (rooms[i].cx - px) * (rooms[i].cx - px) + (rooms[i].cy - py) * (rooms[i].cy - py); if (d < bd) { bd = d; b = rooms[i]; } } return b; }
    var entRoom = nearestRoom(ent.x, ent.y), exitRoom = nearestRoom(exi.x, exi.y);
    var ordered = [entRoom]; for (var i = 0; i < rooms.length; i++) if (rooms[i] !== entRoom) ordered.push(rooms[i]);
    this.rooms = ordered; this.exitRoom = exitRoom;

    // specials: POI → treasure, waypoint → a guardian + its loot. Guarantee ≥1 treasure.
    this.specials = []; var self = this, hasT = false;
    R.specials.forEach(function (sp) {
      var sx = sp.x + ox, sy = sp.y + oy;
      if (sp.type === 'poi') { self.specials.push({ type: 'treasure', x: sx, y: sy }); hasT = true; }
      else if (sp.type === 'waypoint') { self.specials.push({ type: 'guardian', x: sx, y: sy }); self.specials.push({ type: 'treasure', x: sx, y: sy }); hasT = true; }
    });
    if (!hasT) this.specials.push({ type: 'treasure', x: exitRoom.cx + 0.5, y: exitRoom.cy + 0.5 });
    this.portalCell = null;
    return this;
  };

  P.cellAt = function (wx, wy) { var gx = (wx / this.TS) | 0, gy = (wy / this.TS) | 0; if (gx < 0 || gy < 0 || gx >= this.GW || gy >= this.GH) return 1; return this.cells[gy][gx]; };
  P.walkable = function (wx, wy) {
    if (this.cellAt(wx, wy) !== 0) return false;
    if (this.solid) { var gx = (wx / this.TS) | 0, gy = (wy / this.TS) | 0; if (this.solid[gy * this.GW + gx]) return false; }
    return true;
  };
  P.block = function (gx, gy) { if (!this.solid) this.solid = []; if (gx >= 0 && gy >= 0 && gx < this.GW && gy < this.GH) this.solid[gy * this.GW + gx] = 1; };
  // attempt a move with wall-slide (full move, else x-only, else y-only)
  P.tryMove = function (ent, nx, ny) { if (this.walkable(nx, ny)) { ent.x = nx; ent.y = ny; } else if (this.walkable(nx, ent.y)) { ent.x = nx; } else if (this.walkable(ent.x, ny)) { ent.y = ny; } };
  // a wall cell only draws if it borders open floor (8-neighbour); else it's deep void
  P.wallVisible = function (gx, gy) { var c = this.cells; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var nx = gx + dx, ny = gy + dy; if (nx >= 0 && ny >= 0 && nx < this.GW && ny < this.GH && c[ny][nx] === 0) return true; } return false; };

  (window.DGC = window.DGC || {}).MapEngine = MapEngine;
})();
