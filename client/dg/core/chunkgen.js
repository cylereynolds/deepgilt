// Deepgilt — core/ChunkGen : Diablo-2-style prefab chunk + socket map generator.
//
// Clean-room. This reimplements the *concept* of D2's chunk-and-socket level
// assembly (macro-grid of pre-fab chunks joined by edge-matching sockets, with a
// deterministic Left/Right/Straight entrance→exit orientation rule). No D2 DS1
// data, prefab tables, or assets are used — our chunk shapes are authored here.
//
// Two generators, one seeded orchestrator:
//   Type A  genDungeon()    — biased randomized-DFS maze, edge-matched, dead-ends capped
//   Type B  genWilderness()  — bordered field, opposite-edge ent/exit, weighted-A* road, POIs
//
// The model is pure integer math (cells + socket masks). rasterize() bakes it into
// the engine's 0/1 tile grid (same shape MapEngine produces) so it can drive the game.
(function () {
  'use strict';

  // ---- Direction ring (clockwise): N E S W -----------------------------------
  var N = 0, E = 1, S = 2, W = 3;
  var DELTA = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // dx,dy per direction
  var BIT = [1, 2, 4, 8];                            // socket mask bit per direction
  var DNAME = ['N', 'E', 'S', 'W'];

  function opposite(d) { return (d + 2) & 3; }          // mating socket
  function rotate(d, steps) { return (((d + steps) % 4) + 4) % 4; }  // CW by steps quarter-turns
  function bits(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }

  // Left / Right / Straight  ==  a single signed quarter-turn applied to entrance facing.
  var LAYOUT_STEPS = { straight: 0, right: 1, left: -1 };

  // ---- Seeded RNG (mulberry32) — seed → identical layout, always ------------
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- GridNode : one cell of the macro-grid --------------------------------
  function GridNode(x, y) {
    this.x = x; this.y = y;
    this.open = false;     // is a chunk placed here?
    this.mask = 0;         // open-socket bitmask (which edges are doors)
    this.kind = 'void';    // entrance|exit|waypoint|path|room|deadend|road|filler|poi|border|void
    this.facing = -1;      // for entrance/exit: the direction the player MOVES across the threshold
  }

  // ---- MapGenerator ----------------------------------------------------------
  function MapGenerator(opts) {
    opts = opts || {};
    this.GW = opts.GW || 10;
    this.GH = opts.GH || 8;
    this.seed = (opts.seed != null) ? opts.seed : 1;
    this.layout = opts.layout || 'left';     // left|right|straight
    this.rng = makeRng(this.seed);
    this.type = null;                         // 'dungeon' | 'wilderness'
    this.grid = null;
    this.entrance = null; this.exit = null; this.waypoint = null;
  }
  var P = MapGenerator.prototype;

  P._blank = function () {
    var g = [], y, x;
    for (y = 0; y < this.GH; y++) { g[y] = []; for (x = 0; x < this.GW; x++) g[y][x] = new GridNode(x, y); }
    this.grid = g; return g;
  };
  P._in = function (x, y) { return x >= 0 && y >= 0 && x < this.GW && y < this.GH; };
  P._at = function (x, y) { return this._in(x, y) ? this.grid[y][x] : null; };
  // carve a door between adjacent cells a and (a + dir): set both facing sockets
  P._door = function (a, dir) {
    var b = this._at(a.x + DELTA[dir][0], a.y + DELTA[dir][1]); if (!b) return null;
    a.mask |= BIT[dir]; b.mask |= BIT[opposite(dir)]; return b;
  };

  // ===========================================================================
  // TYPE A — DUNGEON / MAZE
  // ===========================================================================
  P.genDungeon = function () {
    this.type = 'dungeon';
    var g = this._blank(), rng = this.rng, GW = this.GW, GH = this.GH;

    // 1. Entrance near center, with a chosen facing (direction player moves leaving it).
    var ex = (GW >> 1) + (rng() < 0.5 ? -1 : 0), ey = (GH >> 1);
    var entrance = g[ey][ex];
    entrance.open = true; entrance.kind = 'entrance';
    entrance.facing = [N, E, S, W][(rng() * 4) | 0];

    // 2. Orientation rule: exit facing is entrance facing turned by the layout's quarter-turn.
    var exitFacing = rotate(entrance.facing, LAYOUT_STEPS[this.layout] || 0);
    var ed = DELTA[exitFacing];           // unit vector the exit is biased toward

    // 3. Biased randomized-DFS carve. Branch choice is weighted toward exitFacing's
    //    half-plane (this is what reproduces the hug-left / hug-right solvability).
    var target = Math.max(8, Math.round(GW * GH * 0.55));
    var stack = [entrance]; var opened = 1;
    var guard = 0, GMAX = GW * GH * 40;
    while (stack.length && opened < target && guard++ < GMAX) {
      var cur = stack[stack.length - 1];
      var cand = [];
      for (var d = 0; d < 4; d++) {
        var nb = this._at(cur.x + DELTA[d][0], cur.y + DELTA[d][1]);
        if (nb && !nb.open) {
          var w = 1;
          if (d === exitFacing) w = 5;                 // strongly prefer driving toward exit
          else if (d === opposite(exitFacing)) w = 0.35; // discourage backtracking homeward
          else w = 2;                                   // perpendiculars keep it from being a straight line
          cand.push({ d: d, nb: nb, w: w });
        }
      }
      if (!cand.length) { stack.pop(); continue; }
      // weighted pick
      var tot = 0, i; for (i = 0; i < cand.length; i++) tot += cand[i].w;
      var r = rng() * tot, pick = cand[cand.length - 1];
      for (i = 0; i < cand.length; i++) { r -= cand[i].w; if (r <= 0) { pick = cand[i]; break; } }
      this._door(cur, pick.d);
      pick.nb.open = true; pick.nb.kind = 'path';
      stack.push(pick.nb); opened++;
    }

    // 3b. A few loop doors so it isn't a pure tree (D2 mazes have some loops).
    var openCells = this._openCells();
    for (i = 0; i < openCells.length; i++) {
      if (rng() < 0.12) {
        var c = openCells[i], ds = this._shuffle([N, E, S, W]);
        for (var j = 0; j < 4; j++) {
          var nb2 = this._at(c.x + DELTA[ds[j]][0], c.y + DELTA[ds[j]][1]);
          if (nb2 && nb2.open && !(c.mask & BIT[ds[j]])) { this._door(c, ds[j]); break; }
        }
      }
    }

    // 4. EXIT = the open cell furthest along exitFacing from the entrance (past min distance).
    var minDist = Math.max(3, ((GW + GH) / 3) | 0);
    var best = null, bestScore = -1e9;
    for (i = 0; i < openCells.length; i++) {
      var n = openCells[i]; if (n === entrance) continue;
      var man = Math.abs(n.x - entrance.x) + Math.abs(n.y - entrance.y);
      if (man < minDist) continue;
      var proj = (n.x - entrance.x) * ed[0] + (n.y - entrance.y) * ed[1]; // distance in exit direction
      var score = proj * 3 + man;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (!best) { // tiny-grid fallback: furthest open cell
      for (i = 0; i < openCells.length; i++) {
        var n2 = openCells[i]; if (n2 === entrance) continue;
        var m2 = Math.abs(n2.x - entrance.x) + Math.abs(n2.y - entrance.y);
        if (m2 > bestScore) { bestScore = m2; best = n2; }
      }
    }
    this.exit = best; best.kind = 'exit'; best.facing = exitFacing;

    // 4b. WAYPOINT = far from BOTH entrance and exit, on its own branch.
    var wp = null, wpBest = -1;
    for (i = 0; i < openCells.length; i++) {
      var n3 = openCells[i]; if (n3.kind !== 'path') continue;
      var de = Math.abs(n3.x - entrance.x) + Math.abs(n3.y - entrance.y);
      var dx2 = Math.abs(n3.x - best.x) + Math.abs(n3.y - best.y);
      var sc = Math.min(de, dx2);
      if (sc > wpBest) { wpBest = sc; wp = n3; }
    }
    if (wp) { wp.kind = 'waypoint'; this.waypoint = wp; }

    // 5/6. Classify the rest by socket count; promote some junctions to rooms.
    //      Dead-ends (1 socket) are already implicitly "capped" — leaves of the carve.
    for (i = 0; i < openCells.length; i++) {
      var c2 = openCells[i];
      if (c2.kind !== 'path') continue;
      var nb3 = bits(c2.mask);
      if (nb3 === 1) c2.kind = 'deadend';
      else if (nb3 >= 3 && rng() < 0.6) c2.kind = 'room';   // open chambers at junctions
      else if (nb3 === 2 && rng() < 0.18) c2.kind = 'room';
    }

    this.entrance = entrance;
    this._meta = { entranceFacing: entrance.facing, exitFacing: exitFacing, layout: this.layout };
    return this;
  };

  // ===========================================================================
  // TYPE B — WILDERNESS (open field + guaranteed meandering road)
  // ===========================================================================
  P.genWilderness = function () {
    this.type = 'wilderness';
    var g = this._blank(), rng = this.rng, GW = this.GW, GH = this.GH, x, y;

    // 1. Perimeter = impassable border (cliffs / dense trees). Interior = open field.
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      var n = g[y][x];
      if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) { n.kind = 'border'; n.open = false; }
      else { n.kind = 'filler'; n.open = true; n.mask = 15; } // open field: all sides walkable
    }

    // 2. Entrance & exit on opposite edges of the interior.
    var ey = 1 + ((rng() * (GH - 2)) | 0), xy = 1 + ((rng() * (GH - 2)) | 0);
    var entrance = g[ey][1]; entrance.kind = 'entrance'; entrance.open = true; entrance.mask = 15; entrance.facing = E;
    var exit = g[xy][GW - 2]; exit.kind = 'exit'; exit.open = true; exit.mask = 15; exit.facing = E;
    this.entrance = entrance; this.exit = exit;

    // 3. Weighted-A* road from entrance to exit. Per-cell jitter makes it meander.
    var jitter = [];
    for (y = 0; y < GH; y++) { jitter[y] = []; for (x = 0; x < GW; x++) jitter[y][x] = 1 + rng() * 5; }
    var path = this._astar(entrance, exit, jitter);
    for (var i = 0; i < path.length; i++) {
      var c = path[i];
      if (c.kind === 'filler') c.kind = 'road';
    }
    this._road = path;

    // 4. POIs in random empty cells — placed AFTER the road, never onto it, so the
    //    road can't be blocked. (filler-only candidates; road/border excluded.)
    var pois = Math.max(2, Math.round((GW * GH) * 0.06));
    var placed = 0, guard = 0;
    while (placed < pois && guard++ < 500) {
      var px = 1 + ((rng() * (GW - 2)) | 0), py = 1 + ((rng() * (GH - 2)) | 0);
      var t = g[py][px];
      if (t.kind === 'filler') { t.kind = 'poi'; placed++; }
    }

    this._meta = { entranceFacing: entrance.facing, exitFacing: exit.facing, layout: 'wilderness' };
    return this;
  };

  // 4-connected weighted A* on the macro-grid; cost to ENTER a cell = its jitter.
  P._astar = function (start, goal, jitter) {
    var GW = this.GW, GH = this.GH, key = function (n) { return n.y * GW + n.x; };
    var openH = [start], came = {}, gsc = {}, fsc = {}, inOpen = {};
    gsc[key(start)] = 0; fsc[key(start)] = this._h(start, goal); inOpen[key(start)] = true;
    while (openH.length) {
      // pop lowest f (small grids → linear scan is fine and stays deterministic)
      var bi = 0; for (var i = 1; i < openH.length; i++) if (fsc[key(openH[i])] < fsc[key(openH[bi])]) bi = i;
      var cur = openH.splice(bi, 1)[0]; inOpen[key(cur)] = false;
      if (cur === goal) return this._reconstruct(came, goal);
      for (var d = 0; d < 4; d++) {
        var nb = this._at(cur.x + DELTA[d][0], cur.y + DELTA[d][1]);
        if (!nb || nb.kind === 'border') continue;
        var tg = gsc[key(cur)] + jitter[nb.y][nb.x];
        if (gsc[key(nb)] == null || tg < gsc[key(nb)]) {
          came[key(nb)] = cur; gsc[key(nb)] = tg; fsc[key(nb)] = tg + this._h(nb, goal);
          if (!inOpen[key(nb)]) { openH.push(nb); inOpen[key(nb)] = true; }
        }
      }
    }
    return [start, goal]; // unreachable fallback (shouldn't happen on an open interior)
  };
  P._h = function (a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); };
  P._reconstruct = function (came, goal) {
    var GW = this.GW, key = function (n) { return n.y * GW + n.x; }, path = [goal], cur = goal;
    while (came[key(cur)]) { cur = came[key(cur)]; path.unshift(cur); }
    return path;
  };

  // ---- helpers ---------------------------------------------------------------
  P._openCells = function () { var o = [], y, x; for (y = 0; y < this.GH; y++) for (x = 0; x < this.GW; x++) if (this.grid[y][x].open) o.push(this.grid[y][x]); return o; };
  P._shuffle = function (a) { var rng = this.rng; for (var i = a.length - 1; i > 0; i--) { var j = (rng() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  // ---- ASCII debugger : prove the macro-grid before binding any visuals ------
  P.ascii = function () {
    var out = [], y, x;
    var m = this._meta || {};
    out.push('seed=' + this.seed + '  type=' + this.type + '  layout=' + (m.layout || '-') +
      '  entranceFacing=' + (DNAME[m.entranceFacing] || '-') + '  exitFacing=' + (DNAME[m.exitFacing] || '-'));
    for (y = 0; y < this.GH; y++) {
      var row = '';
      for (x = 0; x < this.GW; x++) row += this._glyph(this.grid[y][x]) + ' ';
      out.push(row);
    }
    out.push('legend: S start  E exit  W waypoint  + 4way  T 3way  L corner  | vert  - horiz  o deadend  R room  = road  P poi  . field  # border  · void');
    return out.join('\n');
  };
  P._glyph = function (n) {
    if (!n.open) return n.kind === 'border' ? '#' : '·';
    switch (n.kind) {
      case 'entrance': return 'S';
      case 'exit': return 'E';
      case 'waypoint': return 'W';
      case 'room': return 'R';
      case 'road': return '=';
      case 'poi': return 'P';
      case 'filler': return '.';
      case 'deadend': return 'o';
    }
    var b = bits(n.mask);
    if (b >= 4) return '+';
    if (b === 3) return 'T';
    if (b === 2) { if (n.mask === (BIT[N] | BIT[S])) return '|'; if (n.mask === (BIT[E] | BIT[W])) return '-'; return 'L'; }
    if (b === 1) return 'o';
    return '?';
  };

  // ---- rasterize : bake macro-grid → engine tile grid (0 floor / 1 wall) -----
  // Each macro cell = CS×CS micro-tiles. Open cells carve an interior chamber/corridor
  // inside a 1-tile wall ring, then punch a doorway through the ring on each open socket
  // so adjacency in the tile grid == adjacency in the socket graph (connectivity preserved).
  P.rasterize = function (CS) {
    CS = CS || 9; var GW = this.GW, GH = this.GH, TW = GW * CS, TH = GH * CS, y, x;
    var cells = []; for (y = 0; y < TH; y++) { cells[y] = []; for (x = 0; x < TW; x++) cells[y][x] = 1; }
    var rooms = [], specials = [];
    var c = (CS >> 1);                       // local center index
    var rect = function (ox, oy, x0, y0, x1, y1) { for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) cells[oy + ty][ox + tx] = 0; };

    var wild = (this.type === 'wilderness');
    for (var gy = 0; gy < GH; gy++) for (var gx = 0; gx < GW; gx++) {
      var node = this.grid[gy][gx]; if (!node.open) continue;
      var ox = gx * CS, oy = gy * CS;
      if (wild) {                             // WILDERNESS: full-carve open cells → one continuous field
        rect(ox, oy, 0, 0, CS - 1, CS - 1);   // (neighbours merge; only the perimeter border stays cliff)
        rooms.push({ x: ox, y: oy, w: CS, h: CS, cx: ox + c, cy: oy + c });
      } else {                                // DUNGEON: chamber/corridor inside a wall ring + socket doorways
        var big = (node.kind === 'room' || node.kind === 'entrance' || node.kind === 'exit' || node.kind === 'waypoint');
        if (big) {                            // full chamber inside the wall ring
          rect(ox, oy, 1, 1, CS - 2, CS - 2);
          rooms.push({ x: ox + 1, y: oy + 1, w: CS - 2, h: CS - 2, cx: ox + c, cy: oy + c });
        } else {                              // 3-wide corridor cross (maze path)
          rect(ox, oy, c - 1, c - 1, c + 1, c + 1);
        }
        // doorways through the ring on each open socket
        if (node.mask & BIT[N]) rect(ox, oy, c - 1, 0, c + 1, c);
        if (node.mask & BIT[S]) rect(ox, oy, c - 1, c, c + 1, CS - 1);
        if (node.mask & BIT[W]) rect(ox, oy, 0, c - 1, c, c + 1);
        if (node.mask & BIT[E]) rect(ox, oy, c, c - 1, CS - 1, c + 1);
      }
      // record specials at cell centers
      var wx = ox + c + 0.5, wy = oy + c + 0.5;
      if (node.kind === 'entrance') specials.push({ type: 'entrance', x: wx, y: wy });
      else if (node.kind === 'exit') specials.push({ type: 'exit', x: wx, y: wy });
      else if (node.kind === 'waypoint') specials.push({ type: 'waypoint', x: wx, y: wy });
      else if (node.kind === 'poi') specials.push({ type: 'poi', x: wx, y: wy });
    }
    var ent = this.entrance, exi = this.exit;
    return {
      cells: cells, GW: TW, GH: TH, CS: CS, rooms: rooms, specials: specials,
      entrance: ent ? { x: ent.x * CS + c, y: ent.y * CS + c } : null,
      exit: exi ? { x: exi.x * CS + c, y: exi.y * CS + c } : null
    };
  };

  // ---- export (browser window.DGC + node module) ----------------------------
  var api = { MapGenerator: MapGenerator, GridNode: GridNode, makeRng: makeRng, Dir: { N: N, E: E, S: S, W: W }, opposite: opposite, rotate: rotate, LAYOUT_STEPS: LAYOUT_STEPS };
  var root = (typeof window !== 'undefined') ? window : (typeof global !== 'undefined' ? global : this);
  (root.DGC = root.DGC || {}).ChunkGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
