// Deepgilt — core/Path : A* pathfinding over a MapEngine grid (8-neighbour, no corner-cutting).
// Returns world-space waypoints (cell centres), collinear runs collapsed so movement is smooth.
// Clean-room; OD2's d2path is reference only — this is a textbook grid A*.
(function () {
  function find(map, sx, sy, gx, gy) {
    var GW = map.GW, GH = map.GH, TS = map.TS, c = map.cells;
    function walk(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH && c[y][x] === 0; }
    function h(ax, ay, bx, by) { var dx = Math.abs(ax - bx), dy = Math.abs(ay - by); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); }
    var s = { x: (sx / TS) | 0, y: (sy / TS) | 0 }, g = { x: (gx / TS) | 0, y: (gy / TS) | 0 };
    if (!walk(s.x, s.y)) return null;
    if (!walk(g.x, g.y)) {                              // click landed on a wall: snap to nearest floor cell
      var best = null, bd = 1e9;
      for (var ry = -3; ry <= 3; ry++) for (var rx = -3; rx <= 3; rx++) { var nx = g.x + rx, ny = g.y + ry; if (walk(nx, ny)) { var dd = rx * rx + ry * ry; if (dd < bd) { bd = dd; best = { x: nx, y: ny }; } } }
      if (!best) return null; g = best;
    }
    if (s.x === g.x && s.y === g.y) return [{ x: (g.x + 0.5) * TS, y: (g.y + 0.5) * TS }];

    var key = function (x, y) { return y * GW + x; };
    var open = [{ x: s.x, y: s.y, f: h(s.x, s.y, g.x, g.y) }], openSet = {}, came = {}, gScore = {};
    openSet[key(s.x, s.y)] = true; gScore[key(s.x, s.y)] = 0;
    var NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    var guard = 0;
    while (open.length && guard++ < 30000) {
      var bi = 0; for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y); openSet[ck] = false;
      if (cur.x === g.x && cur.y === g.y) {
        var cells = [{ x: cur.x, y: cur.y }], k = ck;
        while (came[k]) { var p = came[k]; cells.unshift({ x: p.x, y: p.y }); k = key(p.x, p.y); }
        // collapse collinear cells, then emit cell centres (skip the start cell)
        var simp = [cells[0]];
        for (var pi = 1; pi < cells.length - 1; pi++) {
          var a = simp[simp.length - 1], b = cells[pi], d = cells[pi + 1];
          if (Math.sign(b.x - a.x) !== Math.sign(d.x - b.x) || Math.sign(b.y - a.y) !== Math.sign(d.y - b.y)) simp.push(b);
        }
        simp.push(cells[cells.length - 1]);
        var out = []; for (var w = 1; w < simp.length; w++) out.push({ x: (simp[w].x + 0.5) * TS, y: (simp[w].y + 0.5) * TS });
        return out.length ? out : null;
      }
      for (var n = 0; n < 8; n++) {
        var nx = cur.x + NB[n][0], ny = cur.y + NB[n][1]; if (!walk(nx, ny)) continue;
        if (NB[n][2] > 1 && (!walk(cur.x + NB[n][0], cur.y) || !walk(cur.x, cur.y + NB[n][1]))) continue; // no corner cutting
        var nk = key(nx, ny), tg = gScore[ck] + NB[n][2];
        if (gScore[nk] === undefined || tg < gScore[nk]) {
          came[nk] = { x: cur.x, y: cur.y }; gScore[nk] = tg; var f = tg + h(nx, ny, g.x, g.y);
          if (!openSet[nk]) { open.push({ x: nx, y: ny, f: f }); openSet[nk] = true; }
          else { for (var j = 0; j < open.length; j++) if (open[j].x === nx && open[j].y === ny) { open[j].f = f; break; } }
        }
      }
    }
    return null;
  }
  (window.DGC = window.DGC || {}).Path = { find: find };
})();
